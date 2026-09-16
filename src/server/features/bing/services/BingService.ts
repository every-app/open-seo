import { AppError } from "@/server/lib/errors";
import {
  createBingWebmasterClient,
  type BingPageStatsRow,
  type BingQueryStatsRow,
  type BingRankAndTrafficStatsRow,
  type BingSite,
} from "@/server/lib/bingWebmasterClient";
import { BingAuthError, BingNotConnectedError } from "@/server/lib/bingErrors";
import { decryptSecret, encryptSecret } from "@/server/lib/bingCrypto";
import { BingApiKeyRepository } from "@/server/features/bing/repositories/BingApiKeyRepository";
import {
  BingConnectionRepository,
  type BingConnection,
} from "@/server/features/bing/repositories/BingConnectionRepository";

export { BingNotConnectedError } from "@/server/lib/bingErrors";

/** Same split GscService.isExpectedGrantFailure makes for GSC: an expected
 *  "reconnect" condition (the stored key is gone or was revoked at Bing) vs. a
 *  real fault (429/5xx) that should surface, not silently show a connect card. */
export function isExpectedKeyFailure(error: unknown): boolean {
  return error instanceof BingAuthError;
}

async function getConnection(
  projectId: string,
): Promise<BingConnection | null> {
  return BingConnectionRepository.getByProjectId(projectId);
}

async function userHasKey(userId: string): Promise<boolean> {
  return Boolean(await BingApiKeyRepository.getByUserId(userId));
}

async function getClientForUser(userId: string) {
  const row = await BingApiKeyRepository.getByUserId(userId);
  if (!row) {
    throw new BingAuthError("No Bing Webmaster API key saved for this user.");
  }
  const apiKey = await decryptSecret(row.encryptedApiKey);
  return createBingWebmasterClient({ apiKey });
}

/** Validates the key against `GetUserSites` before storing it — an API key
 *  with a typo or a revoked key fails loudly here instead of surfacing as a
 *  mysterious empty site list later. */
async function saveApiKey(input: {
  userId: string;
  apiKey: string;
}): Promise<{ sites: BingSite[] }> {
  const trimmed = input.apiKey.trim();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "API key is required.");
  }
  const client = createBingWebmasterClient({ apiKey: trimmed });
  let sites: BingSite[];
  try {
    sites = await client.getUserSites();
  } catch (error) {
    if (error instanceof BingAuthError) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Bing Webmaster Tools rejected this API key. Check it was copied in full.",
      );
    }
    throw error;
  }
  const encryptedApiKey = await encryptSecret(trimmed);
  await BingApiKeyRepository.upsert({ userId: input.userId, encryptedApiKey });
  return { sites };
}

async function listSitesForUser(userId: string): Promise<BingSite[]> {
  const client = await getClientForUser(userId);
  return client.getUserSites();
}

/** Map a verified site to a project. Rejects a site not present on the
 *  user's saved key. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  userId: string;
}): Promise<BingConnection> {
  const client = await getClientForUser(input.userId);
  const sites = await client.getUserSites();
  const match = sites.find((s) => s.Url === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That site isn't available on your saved Bing Webmaster API key.",
    );
  }
  return BingConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
  });
}

async function disconnect(input: { projectId: string }): Promise<void> {
  await BingConnectionRepository.deleteByProjectId(input.projectId);
}

/** Deletes the user's saved API key and every project connection it backs.
 *  Called from account-level "forget this key" and from GDPR erasure. */
async function forgetApiKey(userId: string): Promise<void> {
  await BingApiKeyRepository.deleteByUserId(userId);
}

type BingPerformanceResult = {
  siteUrl: string;
  daily: BingRankAndTrafficStatsRow[];
  queries: BingQueryStatsRow[];
  pages: BingPageStatsRow[];
};

/** Pass-through of Bing's three report endpoints for a project's connected
 *  property, fetched in parallel. Bing gives no date-range/device/country
 *  filters — every call returns its own fixed window. */
async function getPerformance(input: {
  projectId: string;
}): Promise<BingPerformanceResult> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new BingNotConnectedError(input.projectId);
  }
  const client = await getClientForUser(connection.connectedByUserId);
  const [daily, queries, pages] = await Promise.all([
    client.getRankAndTrafficStats(connection.siteUrl),
    client.getQueryStats(connection.siteUrl),
    client.getPageStats(connection.siteUrl),
  ]);
  return { siteUrl: connection.siteUrl, daily, queries, pages };
}

export const BingService = {
  getConnection,
  userHasKey,
  saveApiKey,
  listSitesForUser,
  setSite,
  disconnect,
  forgetApiKey,
  getPerformance,
};
