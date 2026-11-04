import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  notificationChannels,
  notificationDeliveries,
  notificationRules,
  rankCheckRuns,
  rankTrackingConfigs,
} from "@/db/schema";

export async function listChannelsForProject(projectId: string) {
  return db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.projectId, projectId))
    .orderBy(notificationChannels.createdAt);
}

export async function getChannelForProject(input: {
  projectId: string;
  channelId: string;
}) {
  const rows = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, input.channelId),
        eq(notificationChannels.projectId, input.projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertChannel(
  data: typeof notificationChannels.$inferInsert,
) {
  await db.insert(notificationChannels).values(data);
}

export async function deleteChannel(input: {
  projectId: string;
  channelId: string;
}) {
  await db
    .delete(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, input.channelId),
        eq(notificationChannels.projectId, input.projectId),
      ),
    );
}

export async function listRulesForProject(projectId: string) {
  return db
    .select({
      rule: notificationRules,
      channel: notificationChannels,
      config: rankTrackingConfigs,
    })
    .from(notificationRules)
    .innerJoin(
      notificationChannels,
      eq(notificationRules.channelId, notificationChannels.id),
    )
    .leftJoin(
      rankTrackingConfigs,
      eq(notificationRules.rankConfigId, rankTrackingConfigs.id),
    )
    .where(eq(notificationRules.projectId, projectId))
    .orderBy(notificationRules.createdAt);
}

export async function listEnabledProjectWideRankRules(projectId: string) {
  return db
    .select({
      rule: notificationRules,
      channel: notificationChannels,
    })
    .from(notificationRules)
    .innerJoin(
      notificationChannels,
      eq(notificationRules.channelId, notificationChannels.id),
    )
    .where(
      and(
        eq(notificationRules.projectId, projectId),
        eq(notificationRules.enabled, true),
        eq(notificationRules.ruleType, "rank_position_change"),
      ),
    );
}

export async function insertRule(data: typeof notificationRules.$inferInsert) {
  await db.insert(notificationRules).values(data);
}

export async function updateRule(input: {
  projectId: string;
  ruleId: string;
  patch: Partial<typeof notificationRules.$inferInsert>;
}) {
  await db
    .update(notificationRules)
    .set({ ...input.patch, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(notificationRules.id, input.ruleId),
        eq(notificationRules.projectId, input.projectId),
      ),
    );
}

export async function deleteRule(input: {
  projectId: string;
  ruleId: string;
}) {
  await db
    .delete(notificationRules)
    .where(
      and(
        eq(notificationRules.id, input.ruleId),
        eq(notificationRules.projectId, input.projectId),
      ),
    );
}

export async function tryRecordDelivery(input: {
  ruleId: string;
  runId: string;
}): Promise<boolean> {
  const inserted = await db
    .insert(notificationDeliveries)
    .values({
      id: crypto.randomUUID(),
      ruleId: input.ruleId,
      runId: input.runId,
    })
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id });
  return Boolean(inserted[0]);
}

export async function getPreviousCompletedRun(input: {
  configId: string;
  beforeStartedAt: string;
  excludeRunId: string;
}) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, input.configId),
        eq(rankCheckRuns.status, "completed"),
        ne(rankCheckRuns.id, input.excludeRunId),
        lt(rankCheckRuns.startedAt, input.beforeStartedAt),
      ),
    )
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export const NotificationRepository = {
  listChannelsForProject,
  getChannelForProject,
  insertChannel,
  deleteChannel,
  listRulesForProject,
  listEnabledProjectWideRankRules,
  insertRule,
  updateRule,
  deleteRule,
  tryRecordDelivery,
  getPreviousCompletedRun,
};
