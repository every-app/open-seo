import {
  aliasedTable,
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  accountDeletionRequests,
  aiRuns,
  apikey,
  auditLighthouseResults,
  audits,
  ga4Connections,
  gscConnections,
  invitation,
  localRankChecks,
  member,
  organization,
  projects,
  rankCheckRuns,
  reportTemplates,
  reports,
  samSessions,
  session,
  user,
  verification,
  account,
} from "@/db/schema";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";
import { LocalScanStatus } from "@/shared/local-seo";

// Stands in for the erased user on rows other members keep.
const DELETED_USER_ID = "gdpr-deleted-user";

type GoogleProviderId =
  | typeof GSC_OAUTH_PROVIDER_ID
  | typeof GA4_OAUTH_PROVIDER_ID;

const isGoogleProviderId = (value: string): value is GoogleProviderId =>
  value === GSC_OAUTH_PROVIDER_ID || value === GA4_OAUTH_PROVIDER_ID;

async function getRequest(userId: string) {
  const [row] = await db
    .select({
      requestedAt: accountDeletionRequests.requestedAt,
      deleteAfter: accountDeletionRequests.deleteAfter,
    })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, userId))
    .limit(1);
  return row ?? null;
}

/** The user's organizations with each one's member count, oldest first. */
async function listOrganizations(userId: string) {
  const allMembers = aliasedTable(member, "all_members");
  return db
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
      memberCount: count(allMembers.id),
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(allMembers, eq(allMembers.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .groupBy(organization.id, organization.name, member.role)
    .orderBy(asc(organization.id));
}

/**
 * Records the request and, in the same batch, ends every way back into the
 * account: sessions, API keys, and pending invitations into the workspaces
 * that will be deleted with it (so nobody joins one in the meantime).
 */
async function createRequest(input: {
  userId: string;
  requestedAt: string;
  deleteAfter: string;
  soloOrganizationIds: string[];
}) {
  await runBatch((tx) => [
    tx.insert(accountDeletionRequests).values({
      userId: input.userId,
      requestedAt: input.requestedAt,
      deleteAfter: input.deleteAfter,
    }),
    tx.delete(session).where(eq(session.userId, input.userId)),
    tx.delete(apikey).where(eq(apikey.referenceId, input.userId)),
    ...(input.soloOrganizationIds.length > 0
      ? [
          tx
            .delete(invitation)
            .where(
              inArray(invitation.organizationId, input.soloOrganizationIds),
            ),
        ]
      : []),
  ]);
}

async function listDueUserIds(now: string, limit: number) {
  const rows = await db
    .select({ userId: accountDeletionRequests.userId })
    .from(accountDeletionRequests)
    .where(lte(accountDeletionRequests.deleteAfter, now))
    .orderBy(asc(accountDeletionRequests.deleteAfter))
    .limit(limit);
  return rows.map((row) => row.userId);
}

/** Moves a failed erasure behind the rest of the queue. */
async function postponeRequest(userId: string, deleteAfter: string) {
  await db
    .update(accountDeletionRequests)
    .set({ deleteAfter })
    .where(eq(accountDeletionRequests.userId, userId));
}

async function countRequestedBefore(cutoff: string) {
  const [row] = await db
    .select({ value: count() })
    .from(accountDeletionRequests)
    .where(lte(accountDeletionRequests.requestedAt, cutoff));
  return row?.value ?? 0;
}

/**
 * Everything outside the database that has to be erased before the rows that
 * point to it are gone: Workflow instances, Durable Objects, R2 and KV keys,
 * and Google grants.
 */
async function buildInventory(userId: string, organizationIds: string[]) {
  // inArray with an empty list is invalid SQL, so project-scoped queries are
  // skipped when there is nothing to scope them to.
  const projectIds =
    organizationIds.length === 0
      ? []
      : (
          await db
            .select({ id: projects.id })
            .from(projects)
            .where(inArray(projects.organizationId, organizationIds))
        ).map((row) => row.id);
  const inProjects = <T>(query: () => Promise<T[]>) =>
    projectIds.length === 0 ? Promise.resolve([] as T[]) : query();

  const samSessionIds = (
    await db
      .select({ id: samSessions.id })
      .from(samSessions)
      .where(eq(samSessions.userId, userId))
  ).map((row) => row.id);

  // Scratchpad DOs self-destroy at finalize and via a 7-day alarm, and the
  // audit-progress KV key has a 30-minute TTL, so older audits have no
  // Cloudflare state left to erase. startedAt is ISO text, so it compares as
  // a string.
  const auditCutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const auditIds = (
    await inProjects(() =>
      db
        .select({ id: audits.id })
        .from(audits)
        .where(
          and(
            inArray(audits.projectId, projectIds),
            or(gt(audits.startedAt, auditCutoff), eq(audits.status, "running")),
          ),
        ),
    )
  ).map((row) => row.id);

  const r2Keys = (
    await inProjects(() =>
      db
        .selectDistinct({ r2Key: auditLighthouseResults.r2Key })
        .from(auditLighthouseResults)
        .innerJoin(audits, eq(audits.id, auditLighthouseResults.auditId))
        .where(
          and(
            inArray(audits.projectId, projectIds),
            isNotNull(auditLighthouseResults.r2Key),
          ),
        ),
    )
  ).flatMap((row) => (row.r2Key ? [row.r2Key] : []));

  // Google revokes every scope our client holds for a Google account, so a
  // grant another OpenSEO user also holds is left alone; deleting the
  // user's row is what stops it working for them.
  const otherGrant = aliasedTable(account, "other_grant");
  const googleAccounts = (
    await db
      .selectDistinct({
        providerId: account.providerId,
        accountId: account.accountId,
      })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          inArray(account.providerId, [
            GSC_OAUTH_PROVIDER_ID,
            GA4_OAUTH_PROVIDER_ID,
          ]),
          notExists(
            db
              .select({ id: otherGrant.id })
              .from(otherGrant)
              .where(
                and(
                  eq(otherGrant.accountId, account.accountId),
                  ne(otherGrant.userId, userId),
                  inArray(otherGrant.providerId, [
                    GSC_OAUTH_PROVIDER_ID,
                    GA4_OAUTH_PROVIDER_ID,
                  ]),
                ),
              ),
          ),
        ),
      )
  ).flatMap((row) =>
    isGoogleProviderId(row.providerId)
      ? [{ providerId: row.providerId, accountId: row.accountId }]
      : [],
  );

  const activeAuditWorkflowIds = (
    await inProjects(() =>
      db
        .select({
          id: sql<string>`coalesce(${audits.workflowInstanceId}, ${audits.id})`,
        })
        .from(audits)
        .where(
          and(
            inArray(audits.projectId, projectIds),
            eq(audits.status, "running"),
          ),
        ),
    )
  ).map((row) => row.id);
  const activeRankWorkflowIds = (
    await inProjects(() =>
      db
        .select({ id: rankCheckRuns.id })
        .from(rankCheckRuns)
        .where(
          and(
            inArray(rankCheckRuns.projectId, projectIds),
            inArray(rankCheckRuns.status, ["pending", "running"]),
          ),
        ),
    )
  ).map((row) => row.id);
  const activeAiVisibilityWorkflowIds = (
    await inProjects(() =>
      db
        .select({ id: aiRuns.id })
        .from(aiRuns)
        .where(
          and(
            inArray(aiRuns.projectId, projectIds),
            inArray(aiRuns.status, ["queued", "running"]),
          ),
        ),
    )
  ).map((row) => row.id);
  const activeLocalRankWorkflowIds = (
    await inProjects(() =>
      db
        .select({ id: localRankChecks.id })
        .from(localRankChecks)
        .where(
          and(
            inArray(localRankChecks.projectId, projectIds),
            inArray(localRankChecks.status, [
              LocalScanStatus.Queued,
              LocalScanStatus.Running,
            ]),
          ),
        ),
    )
  ).map((row) => row.id);

  return {
    projectIds,
    samSessionIds,
    auditIds,
    r2Keys,
    googleAccounts,
    activeAuditWorkflowIds,
    activeRankWorkflowIds,
    activeAiVisibilityWorkflowIds,
    activeLocalRankWorkflowIds,
  };
}

/**
 * Deletes the user and the workspaces only they belong to in one atomic
 * batch. Rows without a user foreign key are cleaned up explicitly; project
 * data cascades with the organization.
 */
async function eraseUser(input: {
  userId: string;
  email: string;
  organizationIds: string[];
}) {
  const { userId, organizationIds } = input;
  await runBatch((tx) => [
    tx
      .delete(invitation)
      .where(eq(sql`lower(${invitation.email})`, input.email.toLowerCase())),
    // Better Auth keys verification rows by composite identifiers whose value
    // is the user id; the bare email never appears in either column.
    tx
      .delete(verification)
      .where(
        or(eq(verification.identifier, userId), eq(verification.value, userId)),
      ),
    // These columns have no user foreign key, so nothing cascades to them.
    // A Google connection the user made in a workspace they leave behind is
    // their grant, so it goes too.
    tx
      .delete(gscConnections)
      .where(eq(gscConnections.connectedByUserId, userId)),
    tx
      .delete(ga4Connections)
      .where(eq(ga4Connections.connectedByUserId, userId)),
    tx.delete(apikey).where(eq(apikey.referenceId, userId)),
    tx
      .update(audits)
      .set({ startedByUserId: DELETED_USER_ID })
      .where(eq(audits.startedByUserId, userId)),
    // A public link on a report they created is revoked with the
    // attribution: it was published from their work and must not outlive
    // them.
    tx
      .update(reports)
      .set({
        createdByUserId: DELETED_USER_ID,
        shareToken: null,
        sharedAt: null,
      })
      .where(eq(reports.createdByUserId, userId)),
    tx
      .update(reportTemplates)
      .set({ createdByUserId: DELETED_USER_ID })
      .where(eq(reportTemplates.createdByUserId, userId)),
    ...(organizationIds.length > 0
      ? [
          // Re-checked inside the batch: a workspace someone joined since the
          // caller listed it stays, with that member in it.
          tx.delete(organization).where(
            and(
              inArray(organization.id, organizationIds),
              notExists(
                tx
                  .select({ id: member.id })
                  .from(member)
                  .where(
                    and(
                      eq(member.organizationId, organization.id),
                      ne(member.userId, userId),
                    ),
                  ),
              ),
            ),
          ),
        ]
      : []),
    // Cascades to sessions, accounts, memberships, onboarding answers,
    // chat sessions, and the deletion request itself.
    tx.delete(user).where(eq(user.id, userId)),
  ]);
}

async function getUser(userId: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

export const AccountDeletionRepository = {
  getRequest,
  getUser,
  listOrganizations,
  createRequest,
  listDueUserIds,
  postponeRequest,
  countRequestedBefore,
  buildInventory,
  eraseUser,
};
