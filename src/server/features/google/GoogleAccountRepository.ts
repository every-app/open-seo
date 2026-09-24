import { and, count, eq, isNull, or } from "drizzle-orm";
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
  // after this Google identity has been linked to a different app user.
  await runBatch((tx) => [
    tx.delete(connections).where(usage),
    tx.delete(account).where(grant),
  ]);
}

export const GoogleAccountRepository = { getRemovalImpact, remove };
