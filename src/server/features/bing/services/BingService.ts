import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { BING_OAUTH_PROVIDER_ID } from "@/shared/bing";
import { AppError } from "@/server/lib/errors";
import {
  createBingClient,
  getBingSiteUrl,
  BingApiError,
  BingTokenError,
  type BingCrawlIssue,
  type BingSite,
  type BingVisibility,
} from "@/server/lib/bingClient";
import { getBingWebmasterApiKey } from "@/server/features/bing/oauth-config";
import {
  BingConnectionRepository,
  type BingConnection,
} from "@/server/features/bing/repositories/BingConnectionRepository";

const API_KEY_ACCOUNT_ID = "api-key";

type BingSiteListResult = {
  accounts: Array<{
    accountId: string;
    email: string | null;
    requiresReconnect: boolean;
    sites: BingSite[];
  }>;
};

type BingVisibilityResult = {
  siteUrl: string;
  connectedBy: string | null;
  visibility: BingVisibility;
};

type BingCrawlIssuesResult = {
  siteUrl: string;
  connectedBy: string | null;
  issues: BingCrawlIssue[];
};

/** Thrown when a project has no connected Bing Webmaster property. */
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

/** Whether this user has a linked OAuth grant or the self-hosted API-key
 * fallback is configured. The latter is intentionally account-wide: a
 * self-hosted deployment has one operator-managed Bing key. */
async function userHasGrant(userId: string): Promise<boolean> {
  const grants = await listGrantsForUser(userId);
  return grants.length > 0 || Boolean(await getBingWebmasterApiKey());
}

function isApiKeyAccount(accountId: string | null | undefined): boolean {
  return accountId === API_KEY_ACCOUNT_ID;
}

async function createClient(input: {
  userId: string;
  accountId?: string | null;
}) {
  if (isApiKeyAccount(input.accountId)) {
    const apiKey = await getBingWebmasterApiKey();
    if (apiKey) {
      return createBingClient({ userId: input.userId, apiKey });
    }
    throw new BingTokenError(
      "The self-hosted Bing Webmaster API key is not configured.",
    );
  }

  return createBingClient({
    userId: input.userId,
    ...(input.accountId ? { bingAccountId: input.accountId } : {}),
  });
}

/** Expected ways a stored grant fails to reach Bing: no token could be
 * minted, or Bing rejected the call. These surface a reconnect prompt without
 * noisy server logging. */
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
      const client = await createClient({
        userId,
        accountId: grant.accountId,
      });
      try {
        return {
          accountId: grant.accountId,
          email: null,
          requiresReconnect: false,
          sites: await client.listSites(),
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

  // API keys do not create a Better Auth account row. Present one synthetic
  // account to the same property picker flow used by OAuth connections.
  if (accounts.length === 0) {
    const apiKey = await getBingWebmasterApiKey();
    if (apiKey) {
      try {
        const client = createBingClient({ userId, apiKey });
        accounts.push({
          accountId: API_KEY_ACCOUNT_ID,
          email: null,
          requiresReconnect: false,
          sites: await client.listSites(),
        });
      } catch (error) {
        if (!isExpectedGrantFailure(error)) {
          console.error("Failed to list Bing Webmaster API-key sites", error);
        }
        accounts.push({
          accountId: API_KEY_ACCOUNT_ID,
          email: null,
          requiresReconnect: true,
          sites: [],
        });
      }
    }
  }

  return { accounts };
}

/** Map a verified property to a project. The API-key account is available only
 * when the self-hosted fallback key is configured. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  accountId: string;
  userId: string;
}): Promise<BingConnection> {
  const grants = await listGrantsForUser(input.userId);
  const apiKey = await getBingWebmasterApiKey();
  const usesApiKey = input.accountId === API_KEY_ACCOUNT_ID;
  if (!grants.some((grant) => grant.accountId === input.accountId)) {
    if (!(usesApiKey && apiKey)) {
      throw new AppError(
        "NOT_FOUND",
        "That Microsoft account or Bing API key isn't connected to your OpenSEO account.",
      );
    }
  }

  const client = usesApiKey
    ? createBingClient({ userId: input.userId, apiKey: apiKey ?? undefined })
    : await createClient({
        userId: input.userId,
        accountId: input.accountId,
      });
  const sites = await client.listSites();
  const match = sites.find((site) => getBingSiteUrl(site) === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Bing Webmaster property isn't available on the connected account.",
    );
  }

  return BingConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
    bingAccountId: input.accountId,
    connectedAccountEmail: null,
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
    !isApiKeyAccount(connection.bingAccountId) &&
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

async function getVisibility(input: {
  projectId: string;
}): Promise<BingVisibilityResult> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) throw new BingNotConnectedError(input.projectId);

  const client = await createClient({
    userId: connection.connectedByUserId,
    accountId: connection.bingAccountId,
  });
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    visibility: await client.getVisibility(connection.siteUrl),
  };
}

async function getCrawlIssues(input: {
  projectId: string;
}): Promise<BingCrawlIssuesResult> {
  const connection = await BingConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) throw new BingNotConnectedError(input.projectId);

  const client = await createClient({
    userId: connection.connectedByUserId,
    accountId: connection.bingAccountId,
  });
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    issues: await client.getCrawlIssues(connection.siteUrl),
  };
}

export const BingService = {
  getConnection,
  userHasGrant,
  listSitesForUserWithGrantStatus,
  setSite,
  disconnect,
  getVisibility,
  getCrawlIssues,
};
