import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  max,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  aiObservations,
  aiRuns,
  aiSources,
  psArticles,
  psChannels,
  psClusters,
  psKeywordPulls,
  psPulledKeywords,
  psSyndications,
  psTopics,
  psTrackingSnapshots,
} from "@/db/schema";

type Scope = { projectId: string; organizationId: string };

// A published copy is reached through its topic's project and its channel's
// organization, like every syndication read.
function publishedInScope(scope: Scope) {
  return and(
    eq(psTopics.projectId, scope.projectId),
    eq(psChannels.organizationId, scope.organizationId),
    eq(psSyndications.status, "published"),
    isNotNull(psSyndications.liveUrl),
  );
}

async function listPublished(scope: Scope, syndicationIds?: string[]) {
  return db
    .select({
      syndicationId: psSyndications.id,
      liveUrl: psSyndications.liveUrl,
      title: psSyndications.platformTitle,
      publishedAt: psSyndications.publishedAt,
      channelName: psChannels.displayName,
      channelType: psChannels.type,
      topicId: psTopics.id,
      topicTitle: psTopics.title,
      primaryKeyword: psTopics.primaryKeyword,
      locationCode: psTopics.locationCode,
      languageCode: psTopics.languageCode,
    })
    .from(psSyndications)
    .innerJoin(psArticles, eq(psArticles.id, psSyndications.articleId))
    .innerJoin(psTopics, eq(psTopics.id, psArticles.topicId))
    .innerJoin(psChannels, eq(psChannels.id, psSyndications.channelId))
    .where(
      and(
        publishedInScope(scope),
        syndicationIds ? inArray(psSyndications.id, syndicationIds) : undefined,
      ),
    )
    .orderBy(desc(psSyndications.publishedAt));
}

// The latest check of each kind (pending, done, failed) for every copy in
// scope. Read through the scope, not a list of ids, so it stays one bounded
// statement however many copies a project has.
async function listLatestSnapshots(scope: Scope, syndicationIds?: string[]) {
  const latest = db
    .select({
      syndicationId: psTrackingSnapshots.syndicationId,
      status: psTrackingSnapshots.status,
      requestedAt: max(psTrackingSnapshots.requestedAt).as(
        "latest_requested_at",
      ),
    })
    .from(psTrackingSnapshots)
    .innerJoin(
      psSyndications,
      eq(psSyndications.id, psTrackingSnapshots.syndicationId),
    )
    .innerJoin(psArticles, eq(psArticles.id, psSyndications.articleId))
    .innerJoin(psTopics, eq(psTopics.id, psArticles.topicId))
    .innerJoin(psChannels, eq(psChannels.id, psSyndications.channelId))
    .where(
      and(
        eq(psTopics.projectId, scope.projectId),
        eq(psChannels.organizationId, scope.organizationId),
        syndicationIds ? inArray(psSyndications.id, syndicationIds) : undefined,
      ),
    )
    .groupBy(psTrackingSnapshots.syndicationId, psTrackingSnapshots.status)
    .as("latest");
  const rows = await db
    .select({ snapshot: psTrackingSnapshots })
    .from(psTrackingSnapshots)
    .innerJoin(
      latest,
      and(
        eq(latest.syndicationId, psTrackingSnapshots.syndicationId),
        eq(latest.status, psTrackingSnapshots.status),
        eq(latest.requestedAt, psTrackingSnapshots.requestedAt),
      ),
    );
  return rows.map((row) => row.snapshot);
}

// A copy that already has a running check is skipped (the one-pending
// index), so two starts at once can't both buy its reads. Returns the ids
// actually inserted.
async function insertPending(
  rows: {
    id: string;
    syndicationId: string;
    keyword: string | null;
    locationCode: number;
    languageCode: string;
    requestedAt: string;
  }[],
) {
  const inserted: string[] = [];
  // 7 columns a row keeps a batch of 10 under D1's bound-parameter cap.
  for (let i = 0; i < rows.length; i += 10) {
    const written = await db
      .insert(psTrackingSnapshots)
      .values(
        rows
          .slice(i, i + 10)
          .map((row) => ({ ...row, status: "pending" as const })),
      )
      .onConflictDoNothing()
      .returning({ id: psTrackingSnapshots.id });
    inserted.push(...written.map((row) => row.id));
  }
  return inserted;
}

// Every task id of one paid post in one statement (25 checks = 75 bound
// values), so a write failure can't leave some of the paid reads unrecorded.
async function setTaskIds(
  kind: "rank" | "index",
  tasks: { snapshotId: string; taskId: string }[],
) {
  if (tasks.length === 0) return;
  const cases = sql.join(
    tasks.map((task) => sql`when ${task.snapshotId} then ${task.taskId}`),
    sql` `,
  );
  const value = sql`case ${psTrackingSnapshots.id} ${cases} end`;
  await db
    .update(psTrackingSnapshots)
    .set(kind === "rank" ? { rankTaskId: value } : { indexTaskId: value })
    .where(
      inArray(
        psTrackingSnapshots.id,
        tasks.map((task) => task.snapshotId),
      ),
    );
}

async function finish(
  snapshotId: string,
  result: {
    status: "done" | "failed";
    indexed: boolean | null;
    ranked: boolean | null;
    googlePosition: number | null;
    aiCited: boolean | null;
  },
) {
  await db
    .update(psTrackingSnapshots)
    .set({ ...result, checkedAt: new Date().toISOString() })
    .where(
      and(
        eq(psTrackingSnapshots.id, snapshotId),
        eq(psTrackingSnapshots.status, "pending"),
      ),
    );
}

// AI answer sources on these hosts, from the project's prompt tracking runs.
async function listAiSourceUrls(projectId: string, domains: string[]) {
  if (domains.length === 0) return [];
  const rows = await db
    .select({ url: aiSources.url })
    .from(aiSources)
    .innerJoin(aiObservations, eq(aiObservations.id, aiSources.observationId))
    .innerJoin(aiRuns, eq(aiRuns.id, aiObservations.runId))
    .where(
      and(eq(aiRuns.projectId, projectId), inArray(aiSources.domain, domains)),
    )
    .limit(5000);
  return rows.map((row) => row.url);
}

// How much of the project is at each stage, keyword to published copy.
async function stageCounts(scope: Scope) {
  const project = scope.projectId;
  const [pulls, clusters, topics, briefs, articles, copies] = await Promise.all(
    [
      // Distinct, so pulling a seed twice or overlapping seeds counts each
      // kept keyword once.
      db
        .select({ kept: countDistinct(psPulledKeywords.keyword) })
        .from(psPulledKeywords)
        .innerJoin(
          psKeywordPulls,
          eq(psKeywordPulls.id, psPulledKeywords.pullId),
        )
        .where(
          and(
            eq(psKeywordPulls.projectId, project),
            eq(psPulledKeywords.relevant, true),
          ),
        ),
      db
        .select({ n: count() })
        .from(psClusters)
        .where(eq(psClusters.projectId, project)),
      db
        .select({ status: psTopics.status, n: count() })
        .from(psTopics)
        .where(eq(psTopics.projectId, project))
        .groupBy(psTopics.status),
      db
        .select({ n: count() })
        .from(psTopics)
        .where(
          and(
            eq(psTopics.projectId, project),
            isNotNull(psTopics.briefGeneratedAt),
          ),
        ),
      db
        .select({ status: psArticles.status, n: count() })
        .from(psArticles)
        .innerJoin(psTopics, eq(psTopics.id, psArticles.topicId))
        .where(
          and(
            eq(psTopics.projectId, project),
            sql`length(trim(${psArticles.bodyMarkdown})) > 0`,
          ),
        )
        .groupBy(psArticles.status),
      db
        .select({ status: psSyndications.status, n: count() })
        .from(psSyndications)
        .innerJoin(psArticles, eq(psArticles.id, psSyndications.articleId))
        .innerJoin(psTopics, eq(psTopics.id, psArticles.topicId))
        .innerJoin(psChannels, eq(psChannels.id, psSyndications.channelId))
        .where(
          and(
            eq(psTopics.projectId, project),
            eq(psChannels.organizationId, scope.organizationId),
          ),
        )
        .groupBy(psSyndications.status),
    ],
  );
  return {
    keywords: Number(pulls[0]?.kept ?? 0),
    clusters: clusters[0]?.n ?? 0,
    topics,
    briefs: briefs[0]?.n ?? 0,
    articles,
    copies,
  };
}

export const TrackingRepository = {
  listPublished,
  listLatestSnapshots,
  insertPending,
  setTaskIds,
  finish,
  listAiSourceUrls,
  stageCounts,
} as const;
