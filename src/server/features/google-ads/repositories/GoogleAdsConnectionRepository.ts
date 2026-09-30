import { and, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, googleAdsConnections } from "@/db/schema";
import { GOOGLE_ADS_OAUTH_PROVIDER_ID } from "@/shared/google-ads";

export type GoogleAdsConnection = typeof googleAdsConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<GoogleAdsConnection | null> {
  const rows = await db
    .select()
    .from(googleAdsConnections)
    .where(eq(googleAdsConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  customerId: string;
  loginCustomerId: string | null;
  customerDescriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  connectedByUserId: string;
  googleAdsAccountId: string;
  connectedAccountEmail: string | null;
}): Promise<GoogleAdsConnection> {
  const [row] = await db
    .insert(googleAdsConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: googleAdsConnections.projectId,
      set: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        loginCustomerId: input.loginCustomerId,
        customerDescriptiveName: input.customerDescriptiveName,
        currencyCode: input.currencyCode,
        timeZone: input.timeZone,
        connectedByUserId: input.connectedByUserId,
        googleAdsAccountId: input.googleAdsAccountId,
        connectedAccountEmail: sql`case
          when ${googleAdsConnections.connectedByUserId} = ${input.connectedByUserId}
            and ${googleAdsConnections.googleAdsAccountId} = ${input.googleAdsAccountId}
          then coalesce(${input.connectedAccountEmail}, ${googleAdsConnections.connectedAccountEmail})
          else ${input.connectedAccountEmail}
        end`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert google_ads_connection");
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(googleAdsConnections)
    .where(eq(googleAdsConnections.projectId, projectId));
}

/** Release the user's Google Ads grant, but only when no project of theirs
 *  still points at it. The "is anyone else using it" test and the delete are a
 *  single statement on purpose: reading it separately leaves a window in which
 *  another project connecting on the same Google login has its refresh token
 *  deleted out from under it. */
async function unlinkGrantIfUnused(
  userId: string,
  googleAdsAccountId: string,
): Promise<void> {
  await db.delete(account).where(
    and(
      eq(account.userId, userId),
      eq(account.providerId, GOOGLE_ADS_OAUTH_PROVIDER_ID),
      eq(account.accountId, googleAdsAccountId),
      notExists(
        db
          .select({ id: googleAdsConnections.id })
          .from(googleAdsConnections)
          .where(
            and(
              eq(googleAdsConnections.connectedByUserId, userId),
              eq(googleAdsConnections.googleAdsAccountId, googleAdsAccountId),
            ),
          ),
      ),
    ),
  );
}

export const GoogleAdsConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  unlinkGrantIfUnused,
};
