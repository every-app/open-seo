import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  keywordMetrics,
  psClusterKeywords,
  psClusters,
  psKeywordPulls,
  psPulledKeywords,
  psTopics,
} from "@/db/schema";
import type {
  PsFunnelStage,
  PsIntent,
  PsKeywordGroup,
} from "@/shared/platform-seo";

// D1 caps bound parameters at ~100 per statement: 10 rows x <=7 columns.
const ROWS_PER_INSERT = 10;
const VALUES_PER_IN = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

type PulledKeywordInput = {
  keyword: string;
  group: PsKeywordGroup;
  relevant: boolean | null;
  relevanceReason: string | null;
};

async function insertPull(params: {
  projectId: string;
  seed: string;
  seedMeaning: string | null;
  country: string;
  language: string;
  locationCode: number;
  languageCode: string;
  keywords: PulledKeywordInput[];
}): Promise<string> {
  const pullId = crypto.randomUUID();
  await runBatch((tx) => [
    tx.insert(psKeywordPulls).values({
      id: pullId,
      projectId: params.projectId,
      seed: params.seed,
      seedMeaning: params.seedMeaning,
      country: params.country,
      language: params.language,
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      source: "answersocrates",
      stage: "pulled",
      rawCount: params.keywords.length,
      pulledAt: new Date().toISOString(),
    }),
    ...chunk(params.keywords, ROWS_PER_INSERT).map((rows) =>
      tx
        .insert(psPulledKeywords)
        .values(
          rows.map((row) => ({ id: crypto.randomUUID(), pullId, ...row })),
        ),
    ),
  ]);
  return pullId;
}

// Every lookup by a caller-supplied pull id is also scoped to the verified
// project.
async function getPull(projectId: string, pullId: string) {
  const [row] = await db
    .select()
    .from(psKeywordPulls)
    .where(
      and(
        eq(psKeywordPulls.id, pullId),
        eq(psKeywordPulls.projectId, projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listPulls(projectId: string) {
  return db
    .select()
    .from(psKeywordPulls)
    .where(eq(psKeywordPulls.projectId, projectId))
    .orderBy(desc(psKeywordPulls.pulledAt))
    .limit(25);
}

// Callers pass a pull id already verified with getPull.
async function listPulledKeywords(pullId: string) {
  return db
    .select()
    .from(psPulledKeywords)
    .where(eq(psPulledKeywords.pullId, pullId))
    .orderBy(asc(psPulledKeywords.keyword));
}

// Rewrites the pull's keywords with their verdicts in one atomic batch
// (cheaper on D1 than one UPDATE per keyword).
async function saveRelevance(
  pullId: string,
  keywords: PulledKeywordInput[],
  keptCount: number,
) {
  await runBatch((tx) => [
    tx.delete(psPulledKeywords).where(eq(psPulledKeywords.pullId, pullId)),
    ...chunk(keywords, ROWS_PER_INSERT).map((rows) =>
      tx
        .insert(psPulledKeywords)
        .values(
          rows.map((row) => ({ id: crypto.randomUUID(), pullId, ...row })),
        ),
    ),
    tx
      .update(psKeywordPulls)
      .set({ stage: "filtered", keptCount })
      .where(eq(psKeywordPulls.id, pullId)),
  ]);
}

type ClusterInput = {
  name: string;
  dominantIntent: PsIntent;
  funnelStage: PsFunnelStage;
  keywords: { keyword: string; intent: PsIntent; funnelStage: PsFunnelStage }[];
};

async function replaceClusters(
  projectId: string,
  pullId: string,
  clusters: ClusterInput[],
) {
  const rows = clusters.map((cluster, position) => ({
    id: crypto.randomUUID(),
    cluster,
    position,
  }));
  const keywordRows = rows.flatMap(({ id, cluster }) =>
    cluster.keywords.map((keyword) => ({
      id: crypto.randomUUID(),
      clusterId: id,
      ...keyword,
    })),
  );
  await runBatch((tx) => [
    tx.delete(psClusters).where(eq(psClusters.pullId, pullId)),
    ...chunk(rows, ROWS_PER_INSERT).map((part) =>
      tx.insert(psClusters).values(
        part.map(({ id, cluster, position }) => ({
          id,
          projectId,
          pullId,
          name: cluster.name,
          dominantIntent: cluster.dominantIntent,
          funnelStage: cluster.funnelStage,
          position,
        })),
      ),
    ),
    ...chunk(keywordRows, ROWS_PER_INSERT).map((part) =>
      tx.insert(psClusterKeywords).values(part),
    ),
    tx
      .update(psKeywordPulls)
      .set({ stage: "clustered" })
      .where(eq(psKeywordPulls.id, pullId)),
  ]);
}

// Clusters with each keyword's cached volume / KD for the pull's market.
async function listClustersWithMetrics(params: {
  projectId: string;
  pullId: string;
  locationCode: number;
  languageCode: string;
}) {
  const clusters = await db
    .select()
    .from(psClusters)
    .where(
      and(
        eq(psClusters.pullId, params.pullId),
        eq(psClusters.projectId, params.projectId),
      ),
    )
    .orderBy(asc(psClusters.position));
  if (clusters.length === 0) return [];
  const keywordRows = (
    await Promise.all(
      chunk(
        clusters.map((cluster) => cluster.id),
        VALUES_PER_IN,
      ).map((ids) =>
        db
          .select({
            clusterId: psClusterKeywords.clusterId,
            keyword: psClusterKeywords.keyword,
            intent: psClusterKeywords.intent,
            funnelStage: psClusterKeywords.funnelStage,
            searchVolume: keywordMetrics.searchVolume,
            keywordDifficulty: keywordMetrics.keywordDifficulty,
          })
          .from(psClusterKeywords)
          .leftJoin(
            keywordMetrics,
            and(
              eq(keywordMetrics.projectId, params.projectId),
              eq(keywordMetrics.keyword, psClusterKeywords.keyword),
              eq(keywordMetrics.locationCode, params.locationCode),
              eq(keywordMetrics.languageCode, params.languageCode),
            ),
          )
          .where(inArray(psClusterKeywords.clusterId, ids)),
      ),
    )
  ).flat();
  keywordRows.sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
  return clusters.map((cluster) => ({
    ...cluster,
    keywords: keywordRows.filter((row) => row.clusterId === cluster.id),
  }));
}

// Keywords that already have metrics fetched since `since` for this market.
async function listFreshMetricKeywords(params: {
  projectId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
  since: string;
}) {
  const rows = await Promise.all(
    chunk(params.keywords, VALUES_PER_IN).map((part) =>
      db
        .select({
          keyword: keywordMetrics.keyword,
          intent: keywordMetrics.intent,
          searchVolume: keywordMetrics.searchVolume,
        })
        .from(keywordMetrics)
        .where(
          and(
            eq(keywordMetrics.projectId, params.projectId),
            eq(keywordMetrics.locationCode, params.locationCode),
            eq(keywordMetrics.languageCode, params.languageCode),
            inArray(keywordMetrics.keyword, part),
            gte(keywordMetrics.fetchedAt, params.since),
          ),
        ),
    ),
  );
  return rows.flat();
}

type MetricRow = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearches: string;
};

// keyword_metrics has 11 written columns, so 8 rows stay under D1's ~100
// bound parameters per statement.
const METRIC_ROWS_PER_INSERT = 8;
const STATEMENTS_PER_BATCH = 50;

// Bulk upsert into the shared keyword_metrics cache. A row with null metrics
// records "fetched, no data" so a retry does not pay DataForSEO again.
async function upsertKeywordMetrics(params: {
  projectId: string;
  locationCode: number;
  languageCode: string;
  rows: MetricRow[];
}) {
  const fetchedAt = new Date().toISOString();
  const chunks = chunk(params.rows, METRIC_ROWS_PER_INSERT);
  for (const group of chunk(chunks, STATEMENTS_PER_BATCH)) {
    await runBatch((tx) =>
      group.map((rows) =>
        tx
          .insert(keywordMetrics)
          .values(
            rows.map((row) => ({
              projectId: params.projectId,
              locationCode: params.locationCode,
              languageCode: params.languageCode,
              fetchedAt,
              ...row,
            })),
          )
          .onConflictDoUpdate({
            target: [
              keywordMetrics.projectId,
              keywordMetrics.keyword,
              keywordMetrics.locationCode,
              keywordMetrics.languageCode,
            ],
            set: {
              searchVolume: sql`excluded.search_volume`,
              cpc: sql`excluded.cpc`,
              competition: sql`excluded.competition`,
              keywordDifficulty: sql`excluded.keyword_difficulty`,
              intent: sql`excluded.intent`,
              monthlySearches: sql`excluded.monthly_searches`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          }),
      ),
    );
  }
}

async function getCluster(projectId: string, clusterId: string) {
  const [row] = await db
    .select()
    .from(psClusters)
    .where(
      and(eq(psClusters.id, clusterId), eq(psClusters.projectId, projectId)),
    )
    .limit(1);
  return row ?? null;
}

async function insertTopic(params: {
  projectId: string;
  clusterId: string | null;
  title: string;
  angle: string | null;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(psTopics).values({
    id,
    ...params,
    status: "idea",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export const PlatformSeoRepository = {
  insertPull,
  getPull,
  listPulls,
  listPulledKeywords,
  saveRelevance,
  replaceClusters,
  listClustersWithMetrics,
  listFreshMetricKeywords,
  upsertKeywordMetrics,
  getCluster,
  insertTopic,
} as const;
