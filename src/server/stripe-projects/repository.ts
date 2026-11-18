import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  apikey,
  stripeProjectsGrants,
  stripeProjectsResources,
} from "@/db/schema";

type Grant = typeof stripeProjectsGrants.$inferSelect;
type Resource = typeof stripeProjectsResources.$inferSelect;

// What a bearer is bound to. Every resource query matches all three, so one
// user's bearer never reaches another member's resources, even in the same
// organization and Stripe account.
export type StripeProjectsScope = Pick<
  Grant,
  "userId" | "organizationId" | "stripeAccountId"
>;

function grantScope(scope: StripeProjectsScope) {
  return and(
    eq(stripeProjectsGrants.userId, scope.userId),
    eq(stripeProjectsGrants.organizationId, scope.organizationId),
    eq(stripeProjectsGrants.stripeAccountId, scope.stripeAccountId),
  );
}

function resourceScope(scope: StripeProjectsScope) {
  return and(
    eq(stripeProjectsResources.userId, scope.userId),
    eq(stripeProjectsResources.organizationId, scope.organizationId),
    eq(stripeProjectsResources.stripeAccountId, scope.stripeAccountId),
  );
}

async function insertGrant(grant: Grant) {
  await db.insert(stripeProjectsGrants).values(grant);
}

async function findGrantByAccessToken(accessTokenHash: string, now: string) {
  const [row] = await db
    .select()
    .from(stripeProjectsGrants)
    .where(
      and(
        eq(stripeProjectsGrants.accessTokenHash, accessTokenHash),
        gt(stripeProjectsGrants.accessTokenExpiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Refresh tokens rotate: the update only matches the presented hash, so a
// refresh token works once and a replay finds nothing.
async function rotateGrantTokens(
  refreshTokenHash: string,
  next: Pick<
    Grant,
    "accessTokenHash" | "accessTokenExpiresAt" | "refreshTokenHash"
  >,
) {
  const rows = await db
    .update(stripeProjectsGrants)
    .set(next)
    .where(eq(stripeProjectsGrants.refreshTokenHash, refreshTokenHash))
    .returning({ id: stripeProjectsGrants.id });
  return rows.length > 0;
}

async function listGrantsForUser(userId: string) {
  return db
    .select({
      organizationId: stripeProjectsGrants.organizationId,
      stripeAccountId: stripeProjectsGrants.stripeAccountId,
      createdAt: stripeProjectsGrants.createdAt,
    })
    .from(stripeProjectsGrants)
    .where(eq(stripeProjectsGrants.userId, userId))
    .orderBy(stripeProjectsGrants.createdAt);
}

async function deleteGrants(scope: StripeProjectsScope) {
  await db.delete(stripeProjectsGrants).where(grantScope(scope));
}

async function insertResource(resource: Resource) {
  await db.insert(stripeProjectsResources).values(resource);
}

async function findResource(scope: StripeProjectsScope, id: string) {
  const [row] = await db
    .select()
    .from(stripeProjectsResources)
    .where(and(eq(stripeProjectsResources.id, id), resourceScope(scope)))
    .limit(1);
  return row ?? null;
}

// False when the resource is gone, e.g. disconnected from Settings meanwhile.
async function setResourceApiKey(
  scope: StripeProjectsScope,
  id: string,
  apiKeyId: string,
) {
  const rows = await db
    .update(stripeProjectsResources)
    .set({ apiKeyId })
    .where(and(eq(stripeProjectsResources.id, id), resourceScope(scope)))
    .returning({ id: stripeProjectsResources.id });
  return rows.length > 0;
}

// Deletes one resource, or every resource in the scope, and returns the API
// keys they pointed at.
async function deleteResources(scope: StripeProjectsScope, id?: string) {
  const rows = await db
    .delete(stripeProjectsResources)
    .where(
      and(
        resourceScope(scope),
        id ? eq(stripeProjectsResources.id, id) : undefined,
      ),
    )
    .returning({ apiKeyId: stripeProjectsResources.apiKeyId });
  return rows.map((row) => row.apiKeyId);
}

// Keys are deleted rather than disabled so they disappear from Settings too.
// Scoped to the owner so a stale id can never touch someone else's key.
async function deleteApiKeys(userId: string, apiKeyIds: string[]) {
  if (apiKeyIds.length === 0) return;
  await db
    .delete(apikey)
    .where(and(inArray(apikey.id, apiKeyIds), eq(apikey.referenceId, userId)));
}

export const StripeProjectsRepository = {
  insertGrant,
  findGrantByAccessToken,
  rotateGrantTokens,
  listGrantsForUser,
  deleteGrants,
  insertResource,
  findResource,
  setResourceApiKey,
  deleteResources,
  deleteApiKeys,
} as const;
