import { db } from "@/db";
import { keywordMetrics, backlinkSnapshots, rankSnapshots } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import type { SEODataProvider, SEODataRequest } from "../types";
import { ProviderUnsupportedError } from "../errors";
import { getLatestCompetitorSnapshot } from "../competitor-snapshot-repository";
import { DomainOverviewSnapshotRepository } from "../domain-overview-snapshot-repository";

/**
 * Internal data provider — reads from OpenSEO's own database (keyword_metrics
 * table, backlink_snapshots, rank_snapshots). This data was previously fetched
 * from DataForSEO and persisted, so it serves as a free source that avoids
 * re-fetching the same data.
 *
 * Serves:
 *   - keyword_metrics: from the keyword_metrics table (latest per keyword)
 *   - backlinks: from backlink_snapshots (latest summary per project) — the
 *     summary operation only; paginated/history calls fall through to
 *     DataForSEO because the snapshot only stores the summary shape
 *   - domain_keywords: from rank_snapshots (latest tracked keyword positions)
 *   - competitors: from competitor_snapshots (latest analysis per keyword set)
 *   - domain_overview: from fresh organization-scoped normalized snapshots
 */

/**
 * The backlinks operation the internal snapshot can satisfy. `undefined`
 * matches the DataForSEO provider's default (no explicit backlinkCall means
 * summary), so both spellings of the same operation claim support here.
 */
function internalBacklinkCall(request: SEODataRequest): string | undefined {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
  return request.constraints?.backlinkCall as string | undefined;
}

export function createInternalProvider(): SEODataProvider {
  return {
    name: "internal",

    supports(request: SEODataRequest): boolean {
      if (request.dataType === "backlinks") {
        // The snapshot only stores the summary payload. Claiming support for
        // history/rows/referring_domains/domain_pages lets the router cache a
        // wrong-shape payload under those operations' keys and crash the
        // consumer that expects the requested shape.
        const call = internalBacklinkCall(request);
        return call === undefined || call === "summary";
      }
      return (
        request.dataType === "keyword_metrics" ||
        request.dataType === "domain_keywords" ||
        request.dataType === "competitors" ||
        request.dataType === "domain_overview"
      );
    },

    async get(request: SEODataRequest): Promise<unknown> {
      switch (request.dataType) {
        case "keyword_metrics":
          return getInternalKeywordMetrics(request);
        case "backlinks":
          return getInternalBacklinks(request);
        case "domain_keywords":
          return getInternalDomainKeywords(request);
        case "competitors":
          return getInternalCompetitors(request);
        case "domain_overview":
          return getInternalDomainOverview(request);
        default:
          throw new ProviderUnsupportedError(
            "internal",
            request.dataType,
            `Internal provider does not serve ${request.dataType}`,
          );
      }
    },
  };
}

async function getInternalDomainOverview(
  request: SEODataRequest,
): Promise<unknown> {
  const domain = request.domain;
  const organizationId = request.billingCustomer.organizationId;
  if (!domain || !organizationId) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_overview",
      "organizationId and domain are required",
    );
  }

  const snapshot = await DomainOverviewSnapshotRepository.getFresh({
    organizationId,
    domain,
    locationCode: request.locationCode ?? 2840,
    languageCode: request.languageCode ?? "en",
  });
  if (!snapshot) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_overview",
      "No fresh domain overview snapshot found",
    );
  }

  return [
    {
      metrics: {
        organic: {
          etv: snapshot.organicTraffic,
          count: snapshot.organicKeywords,
        },
      },
    },
  ];
}

/**
 * Read keyword metrics from the D1 keyword_metrics table. Filters by the
 * exact requested keyword set (via inArray) so the query returns only
 * relevant rows regardless of how many other keywords share the same
 * location/language. A case-insensitive post-filter handles casing drift
 * between caller and stored data.
 */
async function getInternalKeywordMetrics(
  request: SEODataRequest,
): Promise<unknown> {
  const keywords =
    request.keywords ?? (request.keyword ? [request.keyword] : []);
  if (keywords.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "keyword_metrics",
      "No keywords provided",
    );
  }

  if (request.constraints?.locationName) {
    throw new ProviderUnsupportedError(
      "internal",
      "keyword_metrics",
      "Stored keyword metrics are not scoped to a local location name",
    );
  }

  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;
  const locationCode = request.locationCode ?? 2840;
  const languageCode = request.languageCode ?? "en";

  const conditions = [
    eq(keywordMetrics.locationCode, locationCode),
    eq(keywordMetrics.languageCode, languageCode),
    inArray(keywordMetrics.keyword, keywords),
  ];

  if (projectId) {
    conditions.push(eq(keywordMetrics.projectId, projectId));
  }

  const rows = await db
    .select()
    .from(keywordMetrics)
    .where(and(...conditions));

  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  const filtered = rows.filter((r) => keywordSet.has(r.keyword.toLowerCase()));

  const coveredKeywords = new Set(
    filtered.map((row) => row.keyword.toLowerCase()),
  );
  if (keywords.some((keyword) => !coveredKeywords.has(keyword.toLowerCase()))) {
    throw new ProviderUnsupportedError(
      "internal",
      "keyword_metrics",
      "Stored keyword metrics do not cover the full request",
    );
  }

  return filtered.map((row) => ({
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    cpc: row.cpc,
    competition: row.competition,
    keywordDifficulty: row.keywordDifficulty,
    intent: row.intent,
    monthlySearches: row.monthlySearches,
    fetchedAt: row.fetchedAt,
  }));
}

/**
 * Read the latest backlink summary snapshot for a project/domain from
 * backlink_snapshots. Only the `summary` operation (or an unspecified
 * backlinkCall, which the DataForSEO provider documents as defaulting to
 * summary) is served: the snapshot stores the summary payload only, so
 * history/rows/referring_domains/domain_pages must fall through to
 * DataForSEO. Returns the snake_case shape of `backlinksSummaryItemSchema`
 * (the shape `BacklinksService.buildOverviewResult` and the route schema
 * expect); fields the snapshot table does not track are simply absent.
 */
async function getInternalBacklinks(request: SEODataRequest): Promise<unknown> {
  const call = internalBacklinkCall(request);
  if (call !== undefined && call !== "summary") {
    throw new ProviderUnsupportedError(
      "internal",
      "backlinks",
      `Backlink snapshots only store the summary payload, not "${call}"`,
    );
  }

  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;
  const domain = request.domain;

  if (!projectId && !domain) {
    throw new ProviderUnsupportedError(
      "internal",
      "backlinks",
      "projectId or domain is required",
    );
  }

  const conditions = [];
  if (projectId) {
    conditions.push(eq(backlinkSnapshots.projectId, projectId));
  }
  if (domain) {
    conditions.push(eq(backlinkSnapshots.domain, domain));
  }

  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(and(...conditions))
    .orderBy(desc(backlinkSnapshots.capturedAt))
    .limit(1);

  if (rows.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "backlinks",
      "No cached backlink snapshot found",
    );
  }

  const row = rows[0];
  return {
    target: row.domain,
    rank: row.rank,
    backlinks: row.backlinks,
    referring_domains: row.referringDomains,
    broken_backlinks: row.brokenBacklinks,
    new_backlinks: row.newBacklinks,
    lost_backlinks: row.lostBacklinks,
    new_referring_domains: row.newReferringDomains,
    lost_referring_domains: row.lostReferringDomains,
  };
}

/**
 * Read the latest tracked keyword positions from rank_snapshots. This serves
 * domain_keywords for keywords the user is already tracking — not the full
 * DataForSEO domain keyword universe, but the tracked subset is free.
 */
async function getInternalDomainKeywords(
  request: SEODataRequest,
): Promise<unknown> {
  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;

  if (!projectId) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_keywords",
      "projectId is required",
    );
  }

  const rows = await db
    .select({
      keyword: rankSnapshots.keyword,
      device: rankSnapshots.device,
      position: rankSnapshots.position,
      url: rankSnapshots.url,
      checkedAt: rankSnapshots.checkedAt,
    })
    .from(rankSnapshots)
    .orderBy(desc(rankSnapshots.checkedAt))
    .limit(100);

  if (rows.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_keywords",
      "No tracked keyword snapshots found",
    );
  }

  // Deduplicate: keep only the latest snapshot per (keyword, device)
  const seen = new Set<string>();
  const result: Array<{
    keyword: string;
    device: string;
    position: number | null;
    url: string | null;
    checkedAt: string;
  }> = [];
  for (const row of rows) {
    const key = `${row.keyword}|${row.device}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      keyword: row.keyword,
      device: row.device,
      position: row.position,
      url: row.url,
      checkedAt: row.checkedAt,
    });
  }

  return {
    items: result,
    totalCount: result.length,
  };
}

/**
 * Read the latest persisted SERP competitor analysis for a keyword set +
 * market from competitor_snapshots. The DataForSEO provider write-throughs
 * every paid fetch, so a repeated analysis of the same keyword set is free.
 */
async function getInternalCompetitors(
  request: SEODataRequest,
): Promise<unknown> {
  const keywords =
    request.keywords ?? (request.keyword ? [request.keyword] : []);
  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;

  if (keywords.length === 0 || !projectId) {
    throw new ProviderUnsupportedError(
      "internal",
      "competitors",
      "projectId and keywords are required",
    );
  }

  const items = await getLatestCompetitorSnapshot({
    projectId,
    keywords,
    locationCode: request.locationCode ?? 2840,
    languageCode: request.languageCode ?? "en",
  });

  if (items === null) {
    throw new ProviderUnsupportedError(
      "internal",
      "competitors",
      "No cached competitor snapshot found",
    );
  }

  return items;
}
