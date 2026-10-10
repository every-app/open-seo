import { AppError } from "@/server/lib/errors";
import {
  createBingClient,
  type BingCrawlIssue,
  type BingCrawlStat,
  type BingTrafficRow,
  type BingUrlInfo,
} from "@/server/lib/bingClient";
import { BingAuthError, BingNotConnectedError } from "@/server/lib/bingErrors";
import {
  BingConnectionRepository,
  type BingConnection,
} from "@/server/features/bing/repositories/BingConnectionRepository";
import { BingCredentialRepository } from "@/server/features/bing/repositories/BingCredentialRepository";
import { openApiKey } from "@/server/features/bing/services/BingCredentialService";
import { openOAuthToken } from "@/server/features/bing/services/bingOAuthAccount";
import {
  bingCoverage,
  bingSiteSummary,
  bingStrikingDistance,
  buildBingPerformanceRows,
  type BingCoverage,
  type BingGroupBy,
  type BingPerformanceInput,
  type BingPerformanceRow,
  type BingSiteSummary,
} from "@/server/features/bing/bingPerformance";

type BingPerformanceResult = {
  siteUrl: string;
  groupBy: BingGroupBy;
  coverage: BingCoverage;
  /** Queries ranking just off page one (position 5–20), by impressions. */
  strikingDistance: BingPerformanceRow[];
  rows: BingPerformanceRow[];
};

type BingSummaryResult = {
  siteUrl: string;
  coverage: BingCoverage;
  summary: BingSiteSummary | null;
  /** Daily whole-site clicks and impressions, oldest first. */
  trend: BingTrafficRow[];
};

type BingCrawlResult = {
  siteUrl: string;
  /** Per-day crawl and index counts, oldest first. */
  stats: BingCrawlStat[];
  /** URLs Bing reports crawl issues for; empty when it found none. */
  issues: BingCrawlIssue[];
};

type BingUrlInspection = {
  url: string;
  result: BingUrlInfo | null;
  error?: string;
};

type BingInspectUrlsResult = {
  siteUrl: string;
  results: BingUrlInspection[];
};

async function getConnection(
  projectId: string,
): Promise<BingConnection | null> {
  return BingConnectionRepository.getByProjectId(projectId);
}

/** Map a verified site on a specific credential to a project. A null
 *  credentialId selects the connector's delegated OAuth grant. Rejects sites
 *  not present on that credential and sites that are not verified. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  credentialId: string | null;
  siteUrl: string;
  userId: string;
}): Promise<BingConnection> {
  let client: ReturnType<typeof createBingClient>;
  let credentialId: string | null;
  if (input.credentialId === null) {
    client = createBingClient({
      accessToken: await openOAuthToken(input.userId),
    });
    credentialId = null;
  } else {
    const credential = await BingCredentialRepository.getById(
      input.userId,
      input.credentialId,
    );
    if (!credential) {
      throw new AppError(
        "NOT_FOUND",
        "That Bing account isn't connected to your OpenSEO account.",
      );
    }
    client = createBingClient({
      apiKey: await openApiKey(credential.apiKey),
    });
    credentialId = credential.id;
  }
  const sites = await client.listSites();
  const match = sites.find((site) => site.url === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That site isn't available on the selected Bing account.",
    );
  }
  if (!match.isVerified) {
    throw new AppError(
      "FORBIDDEN",
      "You don't have verified access to that Bing site.",
    );
  }
  return BingConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
    credentialId,
  });
}

/** Removes the project's site mapping, then unlinks the API key only when the
 *  caller owns it and no other project still uses it. A delegated OAuth grant
 *  is never unlinked here — removing a grant is an explicit account action. */
async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) return;
  await BingConnectionRepository.deleteByProjectId(input.projectId);
  if (connection.credentialId === null) return;
  if (connection.connectedByUserId !== input.userId) return;
  const remaining = await BingConnectionRepository.countByCredentialId(
    connection.credentialId,
  );
  if (remaining > 0) return;
  await BingCredentialRepository.deleteById(
    input.userId,
    connection.credentialId,
  );
}

async function requireConnectionClient(projectId: string) {
  const connection = await BingConnectionRepository.getByProjectId(projectId);
  if (!connection) {
    throw new BingNotConnectedError(projectId);
  }
  if (connection.credentialId === null) {
    return {
      connection,
      client: createBingClient({
        accessToken: await openOAuthToken(connection.connectedByUserId),
      }),
    };
  }
  const credential = await BingCredentialRepository.getById(
    connection.connectedByUserId,
    connection.credentialId,
  );
  if (!credential) {
    throw new BingNotConnectedError(projectId);
  }
  return {
    connection,
    client: createBingClient({ apiKey: await openApiKey(credential.apiKey) }),
  };
}

/** Query or page performance for a project's connected Bing site. */
async function getPerformance(
  input: BingPerformanceInput,
): Promise<BingPerformanceResult> {
  const { connection, client } = await requireConnectionClient(input.projectId);
  const groupBy = input.groupBy ?? "query";
  // Striking distance is a view over the query rows, so both query-based tabs
  // share one call; only Pages needs the page endpoint.
  const queryRows = await client.queryStats(connection.siteUrl);
  const rows =
    groupBy === "page"
      ? buildBingPerformanceRows(
          await client.pageStats(connection.siteUrl),
          input,
        )
      : buildBingPerformanceRows(queryRows, input);
  return {
    siteUrl: connection.siteUrl,
    groupBy,
    coverage: bingCoverage(queryRows),
    strikingDistance: bingStrikingDistance(queryRows),
    rows,
  };
}

/** The whole-site summary, from Bing's authoritative site-traffic endpoint.
 *  Kept separate from `getPerformance` so the page can paint it as soon as it
 *  arrives, independently of the table. */
async function getSummary(input: {
  projectId: string;
}): Promise<BingSummaryResult> {
  const { connection, client } = await requireConnectionClient(input.projectId);
  const [traffic, queryRows] = await Promise.all([
    client.rankAndTrafficStats(connection.siteUrl),
    client.queryStats(connection.siteUrl),
  ]);
  // Bing's daily rows arrive in date order; sort defensively, in place (the
  // array is this call's own).
  traffic.sort((a, b) => a.date.localeCompare(b.date));
  return {
    siteUrl: connection.siteUrl,
    coverage: bingCoverage(traffic),
    summary: bingSiteSummary(traffic, queryRows),
    trend: traffic,
  };
}

/** Bing's crawl and index view for the connected site: per-day counts and the
 *  URLs Bing reports crawl issues for. */
async function getCrawl(input: {
  projectId: string;
}): Promise<BingCrawlResult> {
  const { connection, client } = await requireConnectionClient(input.projectId);
  const [stats, issues] = await Promise.all([
    client.crawlStats(connection.siteUrl),
    client.crawlIssues(connection.siteUrl),
  ]);
  stats.sort((a, b) => a.date.localeCompare(b.date));
  return { siteUrl: connection.siteUrl, stats, issues };
}

/** Inspect 1–N URLs against a project's connected Bing site. Per-URL failures
 *  are captured inline so one bad URL doesn't fail the batch; a rejected
 *  credential aborts the call so the caller can prompt a reconnect. */
async function inspectUrls(input: {
  projectId: string;
  urls: string[];
}): Promise<BingInspectUrlsResult> {
  const { connection, client } = await requireConnectionClient(input.projectId);
  const results: BingUrlInspection[] = [];
  for (const url of input.urls) {
    try {
      results.push({
        url,
        result: await client.urlInfo(connection.siteUrl, url),
      });
    } catch (error) {
      if (error instanceof BingAuthError) throw error;
      results.push({
        url,
        result: null,
        error: error instanceof Error ? error.message : "Inspection failed",
      });
    }
  }
  return { siteUrl: connection.siteUrl, results };
}

export const BingService = {
  getConnection,
  setSite,
  disconnect,
  getPerformance,
  getSummary,
  getCrawl,
  inspectUrls,
};
