import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { BING_OAUTH_PROVIDER_ID } from "@/shared/bing";
import { AppError } from "@/server/lib/errors";
import {
  createBingClient,
  BingApiError,
  BingTokenError,
} from "@/server/lib/bingClient";
import {
  BingConnectionRepository,
  type BingConnection,
} from "@/server/features/bing/repositories/BingConnectionRepository";

type BingClient = ReturnType<typeof createBingClient>;
type BingSite = Awaited<ReturnType<BingClient["listSites"]>>[number];
type BingRankAndTrafficStatsRow = Awaited<
  ReturnType<BingClient["getRankAndTrafficStats"]>
>[number];

type BingPerformanceResult = {
  siteUrl: string;
  connectedBy: string | null;
  rows: BingRankAndTrafficStatsRow[];
};

type BingSiteListResult = {
  accounts: Array<{
    accountId: string;
    email: string | null;
    requiresReconnect: boolean;
    sites: BingSite[];
  }>;
};

/** Thrown when a project has no connected Bing Webmaster site. */
export class BingNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Bing Webmaster is not connected for this project");
    this.name = "BingNotConnectedError";
  }
}

async function getConnection(
  projectId: string,
): Promise<BingConnection | null> {
  return BingConnectionRepository.getByProjectId(projectId);
}

/** Whether this user has linked a bing-webmaster grant (regardless of whether
 *  they've picked a site yet). Drives the connect-vs-pick UI. */
async function userHasGrant(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, BING_OAUTH_PROVIDER_ID),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function listGrantsForUser(userId: string) {
  return db
    .select({ id: account.id, accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, BING_OAUTH_PROVIDER_ID),
      ),
    );
}

/** Expected ways a stored grant fails to reach Bing Webmaster: no token could
 *  be minted (refresh token revoked or expired), or Bing rejected the call
 *  (401/403). These surface a reconnect prompt without fault logging. */
export function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof BingTokenError) return true;
  return (
    error instanceof BingApiError &&
    (error.status === 401 || error.status === 403)
  );
}

async function listSitesForUserWithGrantStatus(
  userId: string,
): Promise<BingSiteListResult> {
  const grants = await listGrantsForUser(userId);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createBingClient({
        userId,
        bingAccountId: grant.accountId,
      });

      try {
        const sites = await client.listSites();
        // Best-effort: the account list must still render if the email claim
        // is missing, so this never fails the whole grant.
        let email: string | null = null;
        try {
          email = await client.getConnectedEmail();
        } catch {
          email = null;
        }
        return {
          accountId: grant.accountId,
          email,
          requiresReconnect: false,
          sites,
        };
      } catch (error) {
        if (!isExpectedGrantFailure(error)) {
          console.error(
            "Failed to list Bing Webmaster sites for account",
            grant.accountId,
            error,
          );
        }
        return {
          accountId: grant.accountId,
          email: null,
          requiresReconnect: true,
          sites: [],
        };
      }
    }),
  );
  return { accounts };
}

/** Map a verified site to a project. Rejects unverified sites and sites not
 *  present on the connector's grant. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  accountId: string;
  userId: string;
}): Promise<BingConnection> {
  const grants = await listGrantsForUser(input.userId);
  if (!grants.some((grant) => grant.accountId === input.accountId)) {
    throw new AppError(
      "NOT_FOUND",
      "That Bing account isn't connected to your OpenSEO account.",
    );
  }

  const client = createBingClient({
    userId: input.userId,
    bingAccountId: input.accountId,
  });
  const sites = await client.listSites();
  const match = sites.find((s) => s.url === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Bing Webmaster site isn't available on your connected Bing account.",
    );
  }
  if (!match.isVerified) {
    throw new AppError(
      "FORBIDDEN",
      "That Bing Webmaster site isn't verified yet.",
    );
  }
  // Read from the access token's claims, not a userinfo endpoint (Bing has
  // none). A failure here must not block connecting — the repository coalesce
  // keeps any previously stored value.
  let connectedAccountEmail: string | null = null;
  try {
    connectedAccountEmail = await client.getConnectedEmail();
  } catch {
    connectedAccountEmail = null;
  }
  return BingConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
    bingAccountId: input.accountId,
    connectedAccountEmail,
    authMode: "oauth",
  });
}

async function unlinkUserGrant(
  userId: string,
  bingAccountId: string,
): Promise<void> {
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, BING_OAUTH_PROVIDER_ID),
        eq(account.accountId, bingAccountId),
      ),
    );
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  await BingConnectionRepository.deleteByProjectId(input.projectId);
  if (
    connection?.bingAccountId &&
    connection.connectedByUserId === input.userId
  ) {
    const stillUsed = await BingConnectionRepository.existsForConnectorAccount(
      input.userId,
      connection.bingAccountId,
    );
    if (!stillUsed) {
      await unlinkUserGrant(input.userId, connection.bingAccountId);
    }
  }
}

/** Pass-through of Bing `GetRankAndTrafficStats` for a project's connected
 *  site. Rows are surfaced as-is (Record<string, unknown>) — Bing's field
 *  names are unverified, so nothing is reshaped here. */
async function getPerformance(input: {
  projectId: string;
}): Promise<BingPerformanceResult> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new BingNotConnectedError(input.projectId);
  }
  if (connection.authMode === "api_key") {
    throw new AppError(
      "CONFLICT",
      "This project's Bing connection uses an API key, which isn't supported yet. Reconnect with a Bing account (OAuth) to view performance.",
    );
  }
  const client = createBingClient({
    userId: connection.connectedByUserId,
    bingAccountId: connection.bingAccountId ?? undefined,
  });
  const rows = await client.getRankAndTrafficStats(connection.siteUrl);
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    rows,
  };
}

export const BingService = {
  getConnection,
  userHasGrant,
  listSitesForUserWithGrantStatus,
  setSite,
  disconnect,
  getPerformance,
};
