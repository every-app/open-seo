import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { AppError } from "@/server/lib/errors";
import {
  createGa4Client,
  Ga4ApiError,
  Ga4TokenError,
  type Ga4AccountSummary,
} from "@/server/lib/ga4Client";
import {
  buildRunReportRequest,
  type Ga4PerformanceInput,
} from "@/server/features/ga4/analyticsReport";
import {
  Ga4ConnectionRepository,
  type Ga4Connection,
} from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import type {
  Ga4RunReportRequest,
  Ga4RunReportResponse,
} from "@/server/lib/ga4Client";

type Ga4PerformanceResult = {
  propertyId: string;
  propertyDisplayName: string | null;
  connectedBy: string | null;
  request: Ga4RunReportRequest;
  report: Ga4RunReportResponse;
};

type Ga4PropertyOption = {
  propertyId: string;
  displayName: string;
  isSelected: boolean;
};

type Ga4PropertyListResult = {
  accounts: Array<{
    accountId: string;
    email: string | null;
    requiresReconnect: boolean;
    properties: Ga4PropertyOption[];
  }>;
};

/** Thrown when a project has no connected GA4 property. */
export class Ga4NotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Analytics is not connected for this project");
    this.name = "Ga4NotConnectedError";
  }
}

async function getConnection(
  projectId: string,
): Promise<Ga4Connection | null> {
  return Ga4ConnectionRepository.getByProjectId(projectId);
}

/** Whether this user has linked a google-analytics grant (regardless of
 *  whether they've picked a property yet). Drives the connect-vs-pick UI. */
async function userHasGrant(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GA4_OAUTH_PROVIDER_ID),
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
        eq(account.providerId, GA4_OAUTH_PROVIDER_ID),
      ),
    );
}

/** Expected ways a stored grant fails to reach Analytics: no token could be
 *  minted (refresh token revoked or expired), or Google rejected the call
 *  (401/403). These surface a reconnect prompt without fault logging. */
export function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof Ga4TokenError) return true;
  return (
    error instanceof Ga4ApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function flattenProperties(
  summaries: Ga4AccountSummary[],
  connection: Ga4Connection | null,
): Array<{ accountId: string; properties: Ga4PropertyOption[] }> {
  return summaries.map((summary) => ({
    accountId: summary.account,
    properties: (summary.propertySummaries ?? []).map((property) => ({
      propertyId: property.property,
      displayName: property.displayName,
      isSelected: connection?.propertyId === property.property,
    })),
  }));
}

async function listPropertiesForUserWithGrantStatus(
  userId: string,
  projectId: string,
): Promise<Ga4PropertyListResult> {
  const [grants, connection] = await Promise.all([
    listGrantsForUser(userId),
    Ga4ConnectionRepository.getByProjectId(projectId),
  ]);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createGa4Client({
        userId,
        ga4AccountId: grant.accountId,
      });

      try {
        const summaries = await client.listAccountSummaries();
        let email: string | null = null;
        try {
          email = await client.getUserInfoEmail();
        } catch {
          email = null;
        }
        const byAccount = flattenProperties(summaries, connection);
        return byAccount.map((entry) => ({
          accountId: grant.accountId,
          email,
          requiresReconnect: false,
          properties: entry.properties,
        }));
      } catch (error) {
        if (!isExpectedGrantFailure(error)) {
          console.error(
            "Failed to list Analytics properties for account",
            grant.accountId,
            error,
          );
        }
        return [
          {
            accountId: grant.accountId,
            email: null,
            requiresReconnect: true,
            properties: [],
          },
        ];
      }
    }),
  );
  return { accounts: accounts.flat() };
}

/** Map a property to a project. Rejects properties not present on the
 *  connector's grant. */
async function setProperty(input: {
  projectId: string;
  organizationId: string;
  propertyId: string;
  accountId: string;
  userId: string;
}): Promise<Ga4Connection> {
  const grants = await listGrantsForUser(input.userId);
  if (!grants.some((grant) => grant.accountId === input.accountId)) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }

  const client = createGa4Client({
    userId: input.userId,
    ga4AccountId: input.accountId,
  });
  const summaries = await client.listAccountSummaries();
  const match = summaries
    .flatMap((summary) => summary.propertySummaries ?? [])
    .find((property) => property.property === input.propertyId);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Analytics property isn't available on your connected Google account.",
    );
  }
  let connectedAccountEmail: string | null = null;
  try {
    connectedAccountEmail = await client.getUserInfoEmail();
  } catch {
    connectedAccountEmail = null;
  }
  return Ga4ConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    propertyDisplayName: match.displayName ?? null,
    connectedByUserId: input.userId,
    ga4AccountId: input.accountId,
    connectedAccountEmail,
  });
}

async function unlinkUserGrant(
  userId: string,
  ga4AccountId: string,
): Promise<void> {
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GA4_OAUTH_PROVIDER_ID),
        eq(account.accountId, ga4AccountId),
      ),
    );
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await Ga4ConnectionRepository.getByProjectId(
    input.projectId,
  );
  await Ga4ConnectionRepository.deleteByProjectId(input.projectId);
  if (
    connection?.ga4AccountId &&
    connection.connectedByUserId === input.userId
  ) {
    const stillUsed = await Ga4ConnectionRepository.existsForConnectorAccount(
      input.userId,
      connection.ga4AccountId,
    );
    if (!stillUsed) {
      await unlinkUserGrant(input.userId, connection.ga4AccountId);
    }
  }
}

/** Pass-through of GA4 `runReport` for a project's connected property. */
async function getPerformance(
  input: Ga4PerformanceInput,
): Promise<Ga4PerformanceResult> {
  const connection = await Ga4ConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new Ga4NotConnectedError(input.projectId);
  }
  const request = buildRunReportRequest(input);
  const client = createGa4Client({
    userId: connection.connectedByUserId,
    ga4AccountId: connection.ga4AccountId ?? undefined,
  });
  const report = await client.runReport(connection.propertyId, request);
  return {
    propertyId: connection.propertyId,
    propertyDisplayName: connection.propertyDisplayName,
    connectedBy: connection.connectedAccountEmail,
    request,
    report,
  };
}

export const Ga4Service = {
  getConnection,
  userHasGrant,
  listPropertiesForUserWithGrantStatus,
  setProperty,
  disconnect,
  getPerformance,
};
