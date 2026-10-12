import { and, asc, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  aiTrackers,
  aiPrompts,
  aiRuns,
  aiObservations,
  aiSources,
  aiMatches,
  projects,
  projectCompetitors,
} from "@/db/schema";
import {
  getTracker,
  getConfiguration,
  saveConfiguration,
  type ObservationRow,
  type RunRow,
  type TrackerRow,
} from "./aiVisibilityConfigurationRepository";
export type {
  ConfigurationRows,
  RunRow,
  ObservationRow,
  PromptRow,
  TrackerRow,
} from "./aiVisibilityConfigurationRepository";

const ACTIVE_RUN_STATUSES: RunRow["status"][] = ["queued", "running"];

/** One atomic batch; the one-active-run index rejects a second active run. */
async function createRun(
  run: typeof aiRuns.$inferInsert,
  observations: (typeof aiObservations.$inferInsert)[],
) {
  await runBatch((tx) => [
    tx.insert(aiRuns).values(run),
    ...observations.map((observation) =>
      tx.insert(aiObservations).values(observation),
    ),
  ]);
}

async function getRun(projectId: string, runId: string) {
  return (
    (
      await db
        .select()
        .from(aiRuns)
        .where(and(eq(aiRuns.projectId, projectId), eq(aiRuns.id, runId)))
        .limit(1)
    )[0] ?? null
  );
}

async function getRunInternal(runId: string) {
  return (
    (await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1))[0] ??
    null
  );
}

async function listRuns(projectId: string, limit = 20) {
  return db
    .select()
    .from(aiRuns)
    .where(eq(aiRuns.projectId, projectId))
    .orderBy(desc(aiRuns.createdAt), desc(aiRuns.id))
    .limit(limit);
}

async function getActiveRun(trackerId: string) {
  return (
    (
      await db
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.trackerId, trackerId),
            inArray(aiRuns.status, ACTIVE_RUN_STATUSES),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

const observationColumns = {
  id: aiObservations.id,
  runId: aiObservations.runId,
  promptId: aiObservations.promptId,
  engine: aiObservations.engine,
  branded: aiObservations.branded,
  status: aiObservations.status,
  collectedAt: aiObservations.collectedAt,
  answerMarkdown: aiObservations.answerMarkdown,
  error: aiObservations.error,
  prompt: aiPrompts.text,
  topic: aiPrompts.topic,
};
export type ObservationWithPrompt = ObservationRow & {
  prompt: string;
  topic: string;
};

/** Answers with their prompt's exact text and current topic. */
async function getObservations(
  runIds: string[],
  promptId?: string,
): Promise<ObservationWithPrompt[]> {
  if (!runIds.length) return [];
  return db
    .select(observationColumns)
    .from(aiObservations)
    .innerJoin(aiPrompts, eq(aiPrompts.id, aiObservations.promptId))
    .where(
      and(
        inArray(aiObservations.runId, runIds),
        promptId ? eq(aiObservations.promptId, promptId) : undefined,
      ),
    )
    .orderBy(
      asc(aiPrompts.topic),
      asc(aiPrompts.text),
      asc(aiObservations.engine),
    );
}

async function getObservation(id: string) {
  return (
    (
      await db
        .select(observationColumns)
        .from(aiObservations)
        .innerJoin(aiPrompts, eq(aiPrompts.id, aiObservations.promptId))
        .where(eq(aiObservations.id, id))
        .limit(1)
    )[0] ?? null
  );
}

async function getEvidence(observationIds: string[]) {
  const sources: (typeof aiSources.$inferSelect)[] = [];
  const matches: (typeof aiMatches.$inferSelect)[] = [];
  // Keep every IN list under D1's bind limit; result sets remain bounded by run size.
  for (let offset = 0; offset < observationIds.length; offset += 80) {
    const ids = observationIds.slice(offset, offset + 80);
    const [s, m] = await Promise.all([
      db
        .select()
        .from(aiSources)
        .where(inArray(aiSources.observationId, ids))
        .orderBy(asc(aiSources.position)),
      db.select().from(aiMatches).where(inArray(aiMatches.observationId, ids)),
    ]);
    sources.push(...s);
    matches.push(...m);
  }
  return { sources, matches };
}

/**
 * Prompts with at least one collected answer, in any run. A completed
 * collection with no answer text (no AI Overview shown) does not count.
 */
async function listAnsweredPromptIds(trackerId: string) {
  const rows = await db
    .selectDistinct({ promptId: aiObservations.promptId })
    .from(aiObservations)
    .innerJoin(aiPrompts, eq(aiPrompts.id, aiObservations.promptId))
    .where(
      and(
        eq(aiPrompts.trackerId, trackerId),
        eq(aiObservations.status, "completed"),
        // SQL `<> ''` is also false for NULL, so this excludes both.
        ne(aiObservations.answerMarkdown, ""),
      ),
    );
  return rows.map((row) => row.promptId);
}

/** Replaces an answer's evidence, so a retried collect step stays idempotent. */
async function persistAnswer(input: {
  observationId: string;
  values: Partial<ObservationRow>;
  sources: (typeof aiSources.$inferInsert)[];
  matches: (typeof aiMatches.$inferInsert)[];
}) {
  await runBatch((tx) => [
    tx
      .delete(aiSources)
      .where(eq(aiSources.observationId, input.observationId)),
    tx
      .delete(aiMatches)
      .where(eq(aiMatches.observationId, input.observationId)),
    ...input.sources.map((s) => tx.insert(aiSources).values(s)),
    ...input.matches.map((m) => tx.insert(aiMatches).values(m)),
    tx
      .update(aiObservations)
      .set(input.values)
      .where(eq(aiObservations.id, input.observationId)),
  ]);
}

/** Fails the given answers, or every unfinished answer in the run. */
async function failPendingObservations(
  runId: string,
  error: string,
  ids?: string[],
) {
  await db
    .update(aiObservations)
    .set({ status: "failed", error })
    .where(
      and(
        eq(aiObservations.runId, runId),
        eq(aiObservations.status, "pending"),
        ids ? inArray(aiObservations.id, ids) : undefined,
      ),
    );
}

/** Advances a due tracker only if no one else has since, like claimDueConfig. */
async function claimDueTracker(input: {
  trackerId: string;
  observedNextCheckAt: string;
  values: Partial<TrackerRow>;
}) {
  const claimed = await db
    .update(aiTrackers)
    .set(input.values)
    .where(
      and(
        eq(aiTrackers.id, input.trackerId),
        eq(aiTrackers.enabled, true),
        eq(aiTrackers.nextCheckAt, input.observedNextCheckAt),
      ),
    )
    .returning({ id: aiTrackers.id });
  return claimed.length > 0;
}

export const AiVisibilityRepository = {
  listResearchKeywords: async (projectId: string) =>
    (
      (
        await db
          .select({ keywords: projects.aiResearchKeywords })
          .from(projects)
          .where(eq(projects.id, projectId))
      )[0]?.keywords ?? ""
    )
      .split("\n")
      .filter(Boolean),
  getTracker,
  getConfiguration,
  saveConfiguration,
  updateTracker: (id: string, values: Partial<TrackerRow>) =>
    db.update(aiTrackers).set(values).where(eq(aiTrackers.id, id)),
  claimDueTracker,
  /** Oldest due first; every processed tracker advances its next check. */
  listDue: (now: string) =>
    db
      .select({ tracker: aiTrackers, organizationId: projects.organizationId })
      .from(aiTrackers)
      .innerJoin(projects, eq(projects.id, aiTrackers.projectId))
      .where(
        and(
          eq(aiTrackers.enabled, true),
          lte(aiTrackers.nextCheckAt, now),
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(asc(aiTrackers.nextCheckAt))
      .limit(50),
  createRun,
  getRun,
  getRunInternal,
  listRuns,
  getActiveRun,
  getLatestScheduledRun: async (projectId: string) =>
    (
      await db
        .select()
        .from(aiRuns)
        .where(
          and(eq(aiRuns.projectId, projectId), ne(aiRuns.trigger, "manual")),
        )
        .orderBy(desc(aiRuns.createdAt), desc(aiRuns.id))
        .limit(1)
    )[0] ?? null,
  updateRun: (id: string, values: Partial<RunRow>) =>
    db.update(aiRuns).set(values).where(eq(aiRuns.id, id)),
  getObservations,
  getObservation,
  listAnsweredPromptIds,
  getObservationStatuses: (runIds: string[]) =>
    runIds.length
      ? db
          .select({
            runId: aiObservations.runId,
            status: aiObservations.status,
          })
          .from(aiObservations)
          .where(inArray(aiObservations.runId, runIds))
      : Promise.resolve([]),
  getEvidence,
  persistAnswer,
  failPendingObservations,
  getProject: async (projectId: string) =>
    (
      await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )[0] ?? null,
  listCompetitors: (projectId: string) =>
    db
      .select()
      .from(projectCompetitors)
      .where(eq(projectCompetitors.projectId, projectId)),
};
