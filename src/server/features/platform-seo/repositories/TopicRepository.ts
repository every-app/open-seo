import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  keywordMetrics,
  psClusterKeywords,
  psClusters,
  psKeywordPulls,
  psPulledKeywords,
  psTopicKeywords,
  psTopicOutlineSections,
  psTopicQuestions,
  psTopics,
} from "@/db/schema";
import type { PsTopicStatus } from "@/shared/platform-seo";

// D1 caps bound parameters at ~100 per statement: 20 rows x <=5 columns.
const ROWS_PER_INSERT = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function topicScope(projectId: string, topicId: string) {
  return and(eq(psTopics.id, topicId), eq(psTopics.projectId, projectId));
}

// Every read joins metrics on the topic's own market, so one project can mix
// topics from pulls in different countries.
function keywordsWithMetrics() {
  return db
    .select({
      topicId: psTopicKeywords.topicId,
      keyword: psTopicKeywords.keyword,
      searchVolume: keywordMetrics.searchVolume,
      keywordDifficulty: keywordMetrics.keywordDifficulty,
    })
    .from(psTopicKeywords)
    .innerJoin(psTopics, eq(psTopics.id, psTopicKeywords.topicId))
    .leftJoin(
      keywordMetrics,
      and(
        eq(keywordMetrics.projectId, psTopics.projectId),
        eq(keywordMetrics.keyword, psTopicKeywords.keyword),
        eq(keywordMetrics.locationCode, psTopics.locationCode),
        eq(keywordMetrics.languageCode, psTopics.languageCode),
      ),
    );
}

async function listTopics(projectId: string) {
  const [topics, keywords] = await Promise.all([
    db
      .select()
      .from(psTopics)
      .where(eq(psTopics.projectId, projectId))
      .orderBy(desc(psTopics.updatedAt)),
    keywordsWithMetrics().where(eq(psTopics.projectId, projectId)),
  ]);
  return { topics, keywords };
}

async function getTopic(projectId: string, topicId: string) {
  const [row] = await db
    .select({
      topic: psTopics,
      clusterName: psClusters.name,
      seed: psKeywordPulls.seed,
    })
    .from(psTopics)
    .leftJoin(psClusters, eq(psClusters.id, psTopics.clusterId))
    .leftJoin(psKeywordPulls, eq(psKeywordPulls.id, psTopics.pullId))
    .where(topicScope(projectId, topicId))
    .limit(1);
  if (!row) return null;
  const [keywords, questions, sections] = await Promise.all([
    keywordsWithMetrics().where(eq(psTopicKeywords.topicId, topicId)),
    db
      .select({ question: psTopicQuestions.question })
      .from(psTopicQuestions)
      .where(eq(psTopicQuestions.topicId, topicId))
      .orderBy(asc(psTopicQuestions.position)),
    db
      .select({
        heading: psTopicOutlineSections.heading,
        notes: psTopicOutlineSections.notes,
      })
      .from(psTopicOutlineSections)
      .where(eq(psTopicOutlineSections.topicId, topicId))
      .orderBy(asc(psTopicOutlineSections.position)),
  ]);
  return {
    ...row.topic,
    clusterName: row.clusterName,
    seed: row.seed,
    keywords,
    questions: questions.map((q) => q.question),
    sections,
  };
}

async function findTopicIdByCluster(projectId: string, clusterId: string) {
  const [row] = await db
    .select({ id: psTopics.id })
    .from(psTopics)
    .where(
      and(eq(psTopics.projectId, projectId), eq(psTopics.clusterId, clusterId)),
    )
    .limit(1);
  return row?.id ?? null;
}

async function listClusterKeywords(clusterId: string) {
  const rows = await db
    .select({ keyword: psClusterKeywords.keyword })
    .from(psClusterKeywords)
    .where(eq(psClusterKeywords.clusterId, clusterId));
  return rows.map((row) => row.keyword);
}

async function insertTopic(params: {
  projectId: string;
  clusterId: string | null;
  pullId: string | null;
  title: string;
  angle: string | null;
  locationCode: number;
  languageCode: string;
  keywords: string[];
}) {
  const { keywords, ...topic } = params;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await runBatch((tx) => [
    tx.insert(psTopics).values({
      id,
      ...topic,
      status: "idea",
      createdAt: now,
      updatedAt: now,
    }),
    ...chunk(keywords, ROWS_PER_INSERT).map((part) =>
      tx
        .insert(psTopicKeywords)
        .values(
          part.map((keyword) => ({
            id: crypto.randomUUID(),
            topicId: id,
            keyword,
          })),
        )
        .onConflictDoNothing(),
    ),
  ]);
  return id;
}

async function updateTopic(
  projectId: string,
  topicId: string,
  patch: {
    title?: string;
    angle?: string | null;
    status?: PsTopicStatus;
    primaryKeyword?: string | null;
  },
) {
  const rows = await db
    .update(psTopics)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(topicScope(projectId, topicId))
    .returning({ id: psTopics.id });
  return rows.length > 0;
}

async function deleteTopic(projectId: string, topicId: string) {
  const rows = await db
    .delete(psTopics)
    .where(topicScope(projectId, topicId))
    .returning({ id: psTopics.id });
  return rows.length > 0;
}

// Relevant searches from the pull's Questions group, the brief's candidates.
async function listPullQuestions(pullId: string) {
  const rows = await db
    .select({ keyword: psPulledKeywords.keyword })
    .from(psPulledKeywords)
    .where(
      and(
        eq(psPulledKeywords.pullId, pullId),
        eq(psPulledKeywords.group, "question"),
        eq(psPulledKeywords.relevant, true),
      ),
    );
  return rows.map((row) => row.keyword);
}

// Replaces the brief in one atomic write. The status only moves forward from
// idea, so rewriting a brief never pulls a ready topic back to drafting.
async function saveBrief(params: {
  projectId: string;
  topicId: string;
  primaryKeyword: string;
  angle: string | null;
  questions: string[];
  sections: { heading: string; notes: string | null }[];
}) {
  const now = new Date().toISOString();
  const scope = topicScope(params.projectId, params.topicId);
  await runBatch((tx) => [
    tx
      .delete(psTopicQuestions)
      .where(eq(psTopicQuestions.topicId, params.topicId)),
    tx
      .delete(psTopicOutlineSections)
      .where(eq(psTopicOutlineSections.topicId, params.topicId)),
    ...chunk(params.questions, ROWS_PER_INSERT).map((part, partIndex) =>
      tx.insert(psTopicQuestions).values(
        part.map((question, i) => ({
          id: crypto.randomUUID(),
          topicId: params.topicId,
          question,
          position: partIndex * ROWS_PER_INSERT + i,
        })),
      ),
    ),
    ...chunk(params.sections, ROWS_PER_INSERT).map((part, partIndex) =>
      tx.insert(psTopicOutlineSections).values(
        part.map((section, i) => ({
          id: crypto.randomUUID(),
          topicId: params.topicId,
          heading: section.heading,
          notes: section.notes,
          position: partIndex * ROWS_PER_INSERT + i,
        })),
      ),
    ),
    tx
      .update(psTopics)
      .set({
        primaryKeyword: params.primaryKeyword,
        briefGeneratedAt: now,
        updatedAt: now,
      })
      .where(scope),
    tx
      .update(psTopics)
      .set({ angle: params.angle })
      .where(and(scope, isNull(psTopics.angle))),
    tx
      .update(psTopics)
      .set({ status: "drafting" })
      .where(and(scope, eq(psTopics.status, "idea"))),
  ]);
}

export const TopicRepository = {
  listTopics,
  getTopic,
  findTopicIdByCluster,
  listClusterKeywords,
  insertTopic,
  updateTopic,
  deleteTopic,
  listPullQuestions,
  saveBrief,
} as const;
