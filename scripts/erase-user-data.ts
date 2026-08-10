/**
 * GDPR account erasure for the hosted Postgres deployment.
 *
 * Dry run (the default):
 *   pnpm gdpr:erase-user --email person@example.com
 *
 * Execute after reviewing the inventory:
 *   pnpm gdpr:erase-user --email person@example.com \
 *     --execute --confirm person@example.com \
 *     --confirm-database-host <host printed by the dry run>
 *
 * The Worker endpoint must be deployed with the same GDPR_ERASURE_SECRET as
 * this process. See runbooks/gdpr-erasure.md for required operator variables.
 */
import process from "node:process";
import { Autumn } from "autumn-js";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { GA4_OAUTH_PROVIDER_ID } from "../src/shared/ga4";
import {
  GDPR_STORAGE_ERASURE_PATH,
  signGdprErasureRequest,
  type GdprStorageErasurePayload,
} from "../src/shared/gdpr-erasure";
import { GSC_OAUTH_PROVIDER_ID } from "../src/shared/gsc";
import { loadLocalEnv, parseArgs } from "./cli-utils";
// The Node-safe raw barrel (not ../src/db/schema, the provider-aware one,
// which imports cloudflare:workers).
import * as schema from "../src/db/pg/schema";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const execute = args.execute === "true";
const emailSelector = args.email?.trim().toLowerCase();
const userIdSelector = args["user-id"]?.trim();

type Db = ReturnType<typeof drizzle>;
type UserRow = { id: string; email: string; name: string };

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  const message = errorText(error).toLowerCase();
  return message.includes("404") || message.includes("not found");
}

function printUsage(): never {
  throw new Error(
    "Pass exactly one selector: --email person@example.com or --user-id <id>. Add --execute --confirm <exact-email> only after reviewing the dry run.",
  );
}

async function findUser(db: Db): Promise<UserRow> {
  if (Boolean(emailSelector) === Boolean(userIdSelector)) printUsage();
  const rows = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.user)
    .where(
      emailSelector
        ? sql`lower(${schema.user.email}) = ${emailSelector}`
        : eq(schema.user.id, userIdSelector ?? ""),
    )
    .limit(2);
  if (rows.length === 0) throw new Error("No matching user found.");
  if (rows.length !== 1) throw new Error("Selector matched multiple users.");
  return rows[0];
}

async function buildInventory(db: Db, user: UserRow) {
  const allMembers = alias(schema.member, "all_members");
  const organizations = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      memberCount: count(allMembers.id),
    })
    .from(schema.member)
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.member.organizationId),
    )
    .innerJoin(
      allMembers,
      eq(allMembers.organizationId, schema.organization.id),
    )
    .where(eq(schema.member.userId, user.id))
    .groupBy(schema.organization.id, schema.organization.name)
    .orderBy(schema.organization.id);
  const shared = organizations.filter(
    (organization) => organization.memberCount !== 1,
  );
  if (shared.length > 0) {
    throw new Error(
      `Refusing to erase shared organization(s): ${shared
        .map(
          (organization) =>
            `${organization.id} (${organization.memberCount} members)`,
        )
        .join(
          ", ",
        )}. Transfer/remove the user and handle shared records explicitly first.`,
    );
  }
  const organizationIds = organizations.map((organization) => organization.id);

  // drizzle's inArray throws on empty arrays, so project-scoped queries are
  // skipped outright when the user has no organizations or projects.
  const projects =
    organizationIds.length === 0
      ? []
      : await db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(inArray(schema.projects.organizationId, organizationIds))
          .orderBy(schema.projects.id);
  const projectIds = projects.map((row) => row.id);

  const samSessions = await db
    .select({ id: schema.samSessions.id })
    .from(schema.samSessions)
    .where(eq(schema.samSessions.userId, user.id))
    .orderBy(schema.samSessions.id);

  // Scratchpad DOs self-destroy at finalize and via a 7-day alarm, and the
  // audit-progress KV key has a 30-minute TTL, so older audits have no
  // Cloudflare state left to erase. 30 days gives 4x margin over the alarm
  // and keeps the Worker call within KV's per-invocation operation limit.
  // startedAt is a text column of ISO strings, so compare lexicographically.
  const auditCutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const audits =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: schema.audits.id })
          .from(schema.audits)
          .where(
            and(
              inArray(schema.audits.projectId, projectIds),
              or(
                gt(schema.audits.startedAt, auditCutoff),
                eq(schema.audits.status, "running"),
              ),
            ),
          )
          .orderBy(schema.audits.id);

  const r2Rows =
    projectIds.length === 0
      ? []
      : await db
          .selectDistinct({ r2Key: schema.auditLighthouseResults.r2Key })
          .from(schema.auditLighthouseResults)
          .innerJoin(
            schema.audits,
            eq(schema.audits.id, schema.auditLighthouseResults.auditId),
          )
          .where(
            and(
              inArray(schema.audits.projectId, projectIds),
              isNotNull(schema.auditLighthouseResults.r2Key),
            ),
          )
          .orderBy(schema.auditLighthouseResults.r2Key);
  const r2Keys = r2Rows.flatMap((row) => (row.r2Key ? [row.r2Key] : []));

  const googleAccountRows = await db
    .selectDistinct({
      providerId: schema.account.providerId,
      accountId: schema.account.accountId,
    })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, user.id),
        inArray(schema.account.providerId, [
          GSC_OAUTH_PROVIDER_ID,
          GA4_OAUTH_PROVIDER_ID,
        ]),
      ),
    )
    .orderBy(schema.account.providerId, schema.account.accountId);
  // The where clause already restricts providerId to the two Google
  // providers; the predicate narrows the column's string type to match the
  // erasure payload's enum.
  const isGoogleProviderId = (
    value: string,
  ): value is typeof GSC_OAUTH_PROVIDER_ID | typeof GA4_OAUTH_PROVIDER_ID =>
    value === GSC_OAUTH_PROVIDER_ID || value === GA4_OAUTH_PROVIDER_ID;
  const googleAccounts = googleAccountRows.flatMap((row) =>
    isGoogleProviderId(row.providerId)
      ? [{ providerId: row.providerId, accountId: row.accountId }]
      : [],
  );

  const activeAuditWorkflows =
    projectIds.length === 0
      ? []
      : await db
          .select({
            id: sql<string>`coalesce(${schema.audits.workflowInstanceId}, ${schema.audits.id})`,
          })
          .from(schema.audits)
          .where(
            and(
              inArray(schema.audits.projectId, projectIds),
              eq(schema.audits.status, "running"),
            ),
          )
          .orderBy(schema.audits.id);
  const activeRankWorkflows =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: schema.rankCheckRuns.id })
          .from(schema.rankCheckRuns)
          .where(
            and(
              inArray(schema.rankCheckRuns.projectId, projectIds),
              inArray(schema.rankCheckRuns.status, ["pending", "running"]),
            ),
          )
          .orderBy(schema.rankCheckRuns.id);

  const projectCount = async (table: typeof schema.savedKeywords) =>
    projectIds.length === 0
      ? 0
      : db.$count(table, inArray(table.projectId, projectIds));
  const databaseCounts = {
    sessions: await db.$count(
      schema.session,
      eq(schema.session.userId, user.id),
    ),
    accounts: await db.$count(
      schema.account,
      eq(schema.account.userId, user.id),
    ),
    onboarding_answers: await db.$count(
      schema.userOnboardingAnswers,
      eq(schema.userOnboardingAnswers.userId, user.id),
    ),
    projects: projectIds.length,
    saved_keywords: await projectCount(schema.savedKeywords),
    audits:
      projectIds.length === 0
        ? 0
        : await db.$count(
            schema.audits,
            inArray(schema.audits.projectId, projectIds),
          ),
    rank_snapshots:
      projectIds.length === 0
        ? 0
        : await db
            .select({ value: count() })
            .from(schema.rankSnapshots)
            .innerJoin(
              schema.rankCheckRuns,
              eq(schema.rankCheckRuns.id, schema.rankSnapshots.runId),
            )
            .where(inArray(schema.rankCheckRuns.projectId, projectIds))
            .then((rows) => rows[0]?.value ?? 0),
    sam_sessions: samSessions.length,
    attributed_audits: await db.$count(
      schema.audits,
      eq(schema.audits.startedByUserId, user.id),
    ),
    gsc_connections: await db.$count(
      schema.gscConnections,
      eq(schema.gscConnections.connectedByUserId, user.id),
    ),
    ga4_connections: await db.$count(
      schema.ga4Connections,
      eq(schema.ga4Connections.connectedByUserId, user.id),
    ),
  };

  return {
    organizations,
    projectIds,
    samSessionIds: samSessions.map((row) => row.id),
    auditIds: audits.map((row) => row.id),
    r2Keys,
    googleAccounts,
    activeAuditWorkflowIds: activeAuditWorkflows.map((row) => row.id),
    activeRankWorkflowIds: activeRankWorkflows.map((row) => row.id),
    databaseCounts,
  };
}

async function deleteLoopsContactBy(selector: {
  userId?: string;
  email?: string;
}) {
  const response = await fetch("https://app.loops.so/api/v1/contacts/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("LOOPS_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(selector),
  });
  if (response.status === 404) return "already_absent";
  if (!response.ok) {
    throw new Error(
      `Loops deletion failed (${response.status}): ${await response.text()}`,
    );
  }
  return "deleted";
}

async function deleteLoopsContact(userId: string, email: string) {
  // Waitlist signups (web/src/routes/api/subscribe.ts) create contacts with
  // email only, and the app-side userId backfill is best-effort — so delete by
  // each selector. The Loops API rejects a request carrying both.
  return {
    byUserId: await deleteLoopsContactBy({ userId }),
    byEmail: await deleteLoopsContactBy({ email }),
  };
}

async function deletePostHogPerson(userId: string) {
  const host = optionalEnv(
    "POSTHOG_API_HOST",
    "https://us.posthog.com",
  ).replace(/\/$/u, "");
  const projectId = encodeURIComponent(requiredEnv("POSTHOG_PROJECT_ID"));
  const authorization = `Bearer ${requiredEnv("POSTHOG_PERSONAL_API_KEY")}`;
  // A distinct_id filter matches at most one person, so a single page is
  // enough; `next` is deliberately ignored.
  const listUrl = new URL(`${host}/api/projects/${projectId}/persons/`);
  listUrl.searchParams.set("distinct_id", userId);
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: authorization },
  });
  if (!listResponse.ok) {
    throw new Error(
      `PostHog lookup failed (${listResponse.status}): ${await listResponse.text()}`,
    );
  }
  const people = z
    .object({
      results: z.array(
        z.object({
          id: z.union([z.string(), z.number()]).optional(),
          uuid: z.string().optional(),
        }),
      ),
    })
    .parse(await listResponse.json()).results;
  for (const person of people) {
    const personId = person.id ?? person.uuid;
    if (personId === undefined)
      throw new Error("PostHog returned a person without an id.");
    const response = await fetch(
      `${host}/api/projects/${projectId}/persons/${encodeURIComponent(String(personId))}/?delete_events=true`,
      { method: "DELETE", headers: { Authorization: authorization } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `PostHog deletion failed (${response.status}): ${await response.text()}`,
      );
    }
  }
  return people.length;
}

/**
 * The Autumn key prefix encodes which environment it targets. A sandbox key
 * against production data would 404 every delete and leave the live Stripe
 * subscription running — surface the environment in the dry run so the
 * operator can catch that before executing.
 */
function autumnEnvironment(): string {
  const key = process.env.AUTUMN_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("am_sk_live_")) return "live";
  if (key.startsWith("am_sk_test_")) return "sandbox";
  return "unset-or-unknown";
}

async function deleteAutumnCustomer(organizationIds: string[]) {
  const autumn = new Autumn({ secretKey: requiredEnv("AUTUMN_SECRET_KEY") });
  let deleted = 0;
  let absent = 0;
  for (const organizationId of organizationIds) {
    try {
      await autumn.customers.delete({
        customerId: organizationId,
        deleteInStripe: true,
      });
      deleted += 1;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      absent += 1;
    }
  }
  return { deleted, absent };
}

async function eraseWorkerStorage(payload: GdprStorageErasurePayload) {
  const secret = requiredEnv("GDPR_ERASURE_SECRET");
  const endpoint = new URL(
    GDPR_STORAGE_ERASURE_PATH,
    requiredEnv("BETTER_AUTH_URL"),
  );
  if (endpoint.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use https for GDPR erasure.");
  }
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = await signGdprErasureRequest(secret, timestamp, body);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gdpr-timestamp": timestamp,
      "x-gdpr-signature": signature,
    },
    body,
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Worker storage erasure failed (${response.status}): ${responseBody}`,
    );
  }
  return z
    .object({ ok: z.literal(true), result: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(responseBody) as unknown).result;
}

async function erasePostgres(db: Db, user: UserRow, organizationIds: string[]) {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.invitation)
      .where(sql`lower(${schema.invitation.email}) = lower(${user.email})`);
    // Better Auth stores verification rows keyed by composite identifiers
    // (reset-password:<token>, delete-account-<token>) whose value is the
    // user id; emails never appear bare in either column.
    await tx
      .delete(schema.verification)
      .where(
        or(
          eq(schema.verification.identifier, user.id),
          eq(schema.verification.value, user.id),
        ),
      );
    // These columns intentionally have no user FK. Remove connection records
    // and anonymize retained audit attribution even if the user left that
    // workspace before making this request.
    await tx
      .delete(schema.gscConnections)
      .where(eq(schema.gscConnections.connectedByUserId, user.id));
    await tx
      .delete(schema.ga4Connections)
      .where(eq(schema.ga4Connections.connectedByUserId, user.id));
    await tx
      .update(schema.audits)
      .set({ startedByUserId: "gdpr-deleted-user" })
      .where(eq(schema.audits.startedByUserId, user.id));
    if (organizationIds.length > 0) {
      // Re-assert the solo-membership guard at delete time: anyone who
      // accepted an invite after the inventory was taken must abort the
      // transaction, not be cascaded away with the organization.
      const deletedOrganizations = await tx
        .delete(schema.organization)
        .where(
          and(
            inArray(schema.organization.id, organizationIds),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(schema.member)
                .where(
                  and(
                    eq(schema.member.organizationId, schema.organization.id),
                    ne(schema.member.userId, user.id),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: schema.organization.id });
      if (deletedOrganizations.length !== organizationIds.length) {
        throw new Error(
          "Organization(s) gained other members since the inventory was taken; aborting the Postgres delete. Re-run after resolving membership.",
        );
      }
    }
    const deleted = await tx
      .delete(schema.user)
      .where(eq(schema.user.id, user.id))
      .returning({ id: schema.user.id });
    if (deleted.length !== 1) {
      throw new Error("Postgres user row disappeared before the final delete.");
    }
  });
}

/** Independent post-commit read-back for the erasure receipt. */
async function verifyPostgres(
  db: Db,
  userId: string,
  organizationIds: string[],
) {
  const userRows = await db.$count(schema.user, eq(schema.user.id, userId));
  const organizationRows =
    organizationIds.length === 0
      ? 0
      : await db.$count(
          schema.organization,
          inArray(schema.organization.id, organizationIds),
        );
  if (userRows !== 0 || organizationRows !== 0) {
    throw new Error(
      "Postgres verification failed: user or organization rows remain.",
    );
  }
  return { userRows, organizationRows };
}

async function main() {
  const connectionString = requiredEnv("POSTGRES_DATABASE_URL");
  const databaseUrl = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error(
      "POSTGRES_DATABASE_URL must use postgres:// or postgresql://.",
    );
  }
  const databaseHost = databaseUrl.hostname;
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  try {
    const user = await findUser(db);
    const inventory = await buildInventory(db, user);
    const summary = {
      mode: execute ? "execute" : "dry-run",
      databaseHost,
      user: { id: user.id, email: user.email, name: user.name },
      organizations: inventory.organizations,
      databaseCounts: inventory.databaseCounts,
      cloudflare: {
        onboardingChats: inventory.projectIds.length,
        samChats: inventory.samSessionIds.length,
        auditScratchpads: inventory.auditIds.length,
        r2Objects: inventory.r2Keys.length,
        activeAuditWorkflows: inventory.activeAuditWorkflowIds.length,
        activeRankWorkflows: inventory.activeRankWorkflowIds.length,
      },
      external: {
        googleAccounts: inventory.googleAccounts.length,
        loopsContact: true,
        postHogDistinctId: user.id,
        autumnCustomersAndStripeCustomers: inventory.organizations.length,
        autumnEnvironment: autumnEnvironment(),
      },
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!execute) {
      console.log(
        "\nDry run only. Re-run with --execute --confirm <exact-email> after review.",
      );
      return;
    }
    if (args.confirm?.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new Error(
        "--confirm must exactly match the selected user's email.",
      );
    }
    if (args["confirm-database-host"]?.trim() !== databaseHost) {
      throw new Error(
        `--confirm-database-host must exactly match ${databaseHost}.`,
      );
    }

    const organizationIds = inventory.organizations.map(
      (organization) => organization.id,
    );
    const loops = await deleteLoopsContact(user.id, user.email);
    const postHogPeopleQueued = await deletePostHogPerson(user.id);
    const autumnResult = await deleteAutumnCustomer(organizationIds);
    const storage = await eraseWorkerStorage({
      userId: user.id,
      email: user.email,
      organizationIds,
      projectIds: inventory.projectIds,
      samSessionIds: inventory.samSessionIds,
      auditIds: inventory.auditIds,
      activeAuditWorkflowIds: inventory.activeAuditWorkflowIds,
      activeRankWorkflowIds: inventory.activeRankWorkflowIds,
      r2Keys: inventory.r2Keys,
      googleAccounts: inventory.googleAccounts,
    });
    await erasePostgres(db, user, organizationIds);
    const postgresVerification = await verifyPostgres(
      db,
      user.id,
      organizationIds,
    );

    console.log(
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          userId: user.id,
          email: user.email,
          vendors: { loops, postHogPeopleQueued, autumn: autumnResult },
          storage,
          postgres: postgresVerification,
          retentionNotes: [
            "PostHog event deletion is asynchronous after the person deletion request.",
            "Completed Cloudflare Workflow state and Workers logs expire under the account retention policy.",
            "Database backups and financial records remain only for their documented legal/backup retention periods.",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`GDPR erasure failed: ${errorText(error)}`);
  process.exitCode = 1;
});
