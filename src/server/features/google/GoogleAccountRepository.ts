import {
  and,
  count,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { account, ga4Connections, gscConnections } from "@/db/schema";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

type AccountInput = {
  userId: string;
  provider: "gsc" | "ga4";
  accountId: string;
};

function scope(input: AccountInput) {
  const gsc = input.provider === "gsc";
  const connections = gsc ? gscConnections : ga4Connections;
  return {
    connections,
    grant: and(
      eq(account.userId, input.userId),
      eq(
        account.providerId,
        gsc ? GSC_OAUTH_PROVIDER_ID : GA4_OAUTH_PROVIDER_ID,
      ),
      eq(account.accountId, input.accountId),
    ),
    usage: and(
      eq(connections.connectedByUserId, input.userId),
      gsc
        ? // Legacy GSC mappings can use any of this user's grants.
          or(
            eq(gscConnections.gscAccountId, input.accountId),
            isNull(gscConnections.gscAccountId),
          )
        : eq(ga4Connections.ga4AccountId, input.accountId),
    ),
  };
}

async function getRemovalImpact(input: AccountInput) {
  const { connections, usage } = scope(input);
  const [result] = await db
    .select({ projectCount: count() })
    .from(connections)
    .where(usage);
  return { projectCount: result?.projectCount ?? 0 };
}

async function remove(input: AccountInput) {
  const { connections, grant, usage } = scope(input);
  // Atomic on D1 and Postgres: never leave a partial account removal.
  // Both deletes are scoped to the authenticated owner, including on retries
  // after this Google identity has been linked to a different OpenSEO user.
  await runBatch((tx) => [
    tx.delete(connections).where(usage),
    tx.delete(account).where(grant),
  ]);
}

async function listGscProjectIds(input: AccountInput) {
  const rows = await db
    .select({ projectId: gscConnections.projectId })
    .from(gscConnections)
    .where(scope({ ...input, provider: "gsc" }).usage);
  return rows.map((row) => row.projectId);
}

const DATA_PROVIDER_IDS = [GSC_OAUTH_PROVIDER_ID, GA4_OAUTH_PROVIDER_ID];

// Correlated on the outer `account` row: true while a project mapping still
// relies on that grant, with the same rules `scope().usage` applies.
function grantInUse(): SQL {
  const inUse = or(
    and(
      eq(account.providerId, GSC_OAUTH_PROVIDER_ID),
      exists(
        db
          .select({ id: gscConnections.id })
          .from(gscConnections)
          .where(
            and(
              eq(gscConnections.connectedByUserId, account.userId),
              or(
                eq(gscConnections.gscAccountId, account.accountId),
                isNull(gscConnections.gscAccountId),
              ),
            ),
          ),
      ),
    ),
    and(
      eq(account.providerId, GA4_OAUTH_PROVIDER_ID),
      exists(
        db
          .select({ id: ga4Connections.id })
          .from(ga4Connections)
          .where(
            and(
              eq(ga4Connections.connectedByUserId, account.userId),
              eq(ga4Connections.ga4AccountId, account.accountId),
            ),
          ),
      ),
    ),
  );
  // `or` is only undefined when given no conditions.
  return inUse ?? sql`false`;
}

/** Search Console / Analytics grants no project uses, last touched before the cutoff. */
async function listUnusedGrants(updatedBefore: Date, limit: number) {
  return db
    .select({
      id: account.id,
      userId: account.userId,
      providerId: account.providerId,
      accountId: account.accountId,
    })
    .from(account)
    .where(
      and(
        inArray(account.providerId, DATA_PROVIDER_IDS),
        lt(account.updatedAt, updatedBefore),
        not(grantInUse()),
      ),
    )
    .limit(limit);
}

/** Deletes the grant unless a project started using it since it was listed. */
async function deleteUnusedGrant(id: string) {
  const deleted = await db
    .delete(account)
    .where(and(eq(account.id, id), not(grantInUse())))
    .returning({ id: account.id });
  return deleted.length > 0;
}

/** Whether any OpenSEO user still stores a data grant for this Google account. */
async function hasDataGrantsForGoogleAccount(accountId: string) {
  const [result] = await db
    .select({ grants: count() })
    .from(account)
    .where(
      and(
        inArray(account.providerId, DATA_PROVIDER_IDS),
        eq(account.accountId, accountId),
      ),
    );
  return (result?.grants ?? 0) > 0;
}

export const GoogleAccountRepository = {
  getRemovalImpact,
  remove,
  listGscProjectIds,
  listUnusedGrants,
  deleteUnusedGrant,
  hasDataGrantsForGoogleAccount,
};
