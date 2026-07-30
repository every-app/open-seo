import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gbp";
import { AppError } from "@/server/lib/errors";
import {
  createGbpClient,
  GbpApiError,
  GbpTokenError,
  type GbpAccount,
  type GbpLocation,
  type GbpLocationSummary,
} from "@/server/lib/gbpClient";
import {
  GbpConnectionRepository,
  type GbpConnection,
} from "@/server/features/gbp/repositories/GbpConnectionRepository";

type GbpAccountListResult = {
  accounts: Array<{
    accountId: string;
    email: string | null;
    requiresReconnect: boolean;
    locations: GbpLocationSummary[];
  }>;
};

/** Thrown when a project has no connected GBP location. */
export class GbpNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Business Profile is not connected for this project");
    this.name = "GbpNotConnectedError";
  }
}

async function getConnection(projectId: string): Promise<GbpConnection | null> {
  return GbpConnectionRepository.getByProjectId(projectId);
}

/** Whether this user has linked a google-business-profile grant (regardless of
 *  whether they've picked a location yet). Drives the connect-vs-pick UI. */
async function userHasGrant(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
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
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
      ),
    );
}

/** Expected ways a stored grant fails to reach Business Profile: no token could be
 *  minted (refresh token revoked or expired), or Google rejected the call
 *  (401/403). These surface a reconnect prompt without fault logging. */
export function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof GbpTokenError) return true;
  return (
    error instanceof GbpApiError &&
    (error.status === 401 || error.status === 403)
  );
}

async function listAccountsForUserWithGrantStatus(
  userId: string,
): Promise<GbpAccountListResult> {
  const grants = await listGrantsForUser(userId);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createGbpClient({ userId, gbpAccountId: grant.accountId });

      try {
        const gbpAccounts: GbpAccount[] = await client.listAccounts();
        let email: string | null = null;
        try {
          email = await client.getUserInfoEmail();
        } catch {
          email = null;
        }

        const locationsByAccount = await Promise.all(
          gbpAccounts.map((gbpAccount) =>
            client.listLocations(gbpAccount.name),
          ),
        );

        return {
          accountId: grant.accountId,
          email,
          requiresReconnect: false,
          locations: locationsByAccount.flat(),
        };
      } catch (error) {
        if (!isExpectedGrantFailure(error)) {
          console.error(
            "Failed to list Business Profile locations for account",
            grant.accountId,
            error,
          );
        }
        return {
          accountId: grant.accountId,
          email: null,
          requiresReconnect: true,
          locations: [],
        };
      }
    }),
  );

  return { accounts };
}

/** Map a verified location to a project. Rejects locations not present on the
 *  connector's grant. */
async function setLocation(input: {
  projectId: string;
  organizationId: string;
  locationName: string;
  accountId: string;
  userId: string;
}): Promise<GbpConnection> {
  const grants = await listGrantsForUser(input.userId);
  if (!grants.some((grant) => grant.accountId === input.accountId)) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }

  const client = createGbpClient({
    userId: input.userId,
    gbpAccountId: input.accountId,
  });
  const gbpAccounts = await client.listAccounts();
  const locationsByAccount = await Promise.all(
    gbpAccounts.map((gbpAccount) => client.listLocations(gbpAccount.name)),
  );
  const allLocations = locationsByAccount.flat();
  const match = allLocations.find(
    (location) => location.name === input.locationName,
  );
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That location isn't available on your connected Google account.",
    );
  }

  let connectedAccountEmail: string | null = null;
  try {
    connectedAccountEmail = await client.getUserInfoEmail();
  } catch {
    connectedAccountEmail = null;
  }

  return GbpConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    locationName: input.locationName,
    connectedByUserId: input.userId,
    gbpAccountId: input.accountId,
    connectedAccountEmail,
  });
}

async function unlinkUserGrant(
  userId: string,
  gbpAccountId: string,
): Promise<void> {
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
        eq(account.accountId, gbpAccountId),
      ),
    );
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await GbpConnectionRepository.getByProjectId(
    input.projectId,
  );
  await GbpConnectionRepository.deleteByProjectId(input.projectId);
  if (
    connection?.gbpAccountId &&
    connection.connectedByUserId === input.userId
  ) {
    const stillUsed = await GbpConnectionRepository.existsForConnectorAccount(
      input.userId,
      connection.gbpAccountId,
    );
    if (!stillUsed) {
      await unlinkUserGrant(input.userId, connection.gbpAccountId);
    }
  }
}

/** Fetch the full profile (title, address, phone, categories, hours, website)
 *  for a project's connected location. */
async function getLocationInfo(input: {
  projectId: string;
}): Promise<{ location: GbpLocation; connectedBy: string | null }> {
  const connection = await GbpConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new GbpNotConnectedError(input.projectId);
  }
  const client = createGbpClient({
    userId: connection.connectedByUserId,
    gbpAccountId: connection.gbpAccountId ?? undefined,
  });
  const location = await client.getLocation(connection.locationName);
  return { location, connectedBy: connection.connectedAccountEmail };
}

export const GbpService = {
  getConnection,
  userHasGrant,
  listAccountsForUserWithGrantStatus,
  setLocation,
  disconnect,
  getLocationInfo,
};
