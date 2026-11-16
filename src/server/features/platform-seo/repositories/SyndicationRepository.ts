import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  psArticles,
  psChannels,
  psSyndicationTags,
  psSyndications,
  psTopics,
} from "@/db/schema";
import type {
  PsAiDisclosure,
  PsSyndicationStatus,
} from "@/shared/platform-seo";

type PlatformVersion = {
  title: string;
  summary: string | null;
  body: string;
  tags: string[];
};

function tagRows(syndicationId: string, tags: string[]) {
  return tags.map((tag, position) => ({
    id: crypto.randomUUID(),
    syndicationId,
    tag,
    position,
  }));
}

async function tagsFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select()
    .from(psSyndicationTags)
    .where(inArray(psSyndicationTags.syndicationId, ids))
    .orderBy(asc(psSyndicationTags.position));
  const out = new Map<string, string[]>();
  for (const row of rows) {
    out.set(row.syndicationId, [
      ...(out.get(row.syndicationId) ?? []),
      row.tag,
    ]);
  }
  return out;
}

// An article has at most one syndication per channel; channels number a few.
async function listForArticle(articleId: string) {
  const rows = await db
    .select()
    .from(psSyndications)
    .where(eq(psSyndications.articleId, articleId));
  const tags = await tagsFor(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, tags: tags.get(row.id) ?? [] }));
}

// A syndication reached through both its article's project and its channel's
// organization, so neither id can be swapped for another tenant's.
async function getScoped(params: {
  projectId: string;
  organizationId: string;
  syndicationId: string;
}) {
  const [row] = await db
    .select({
      syndication: psSyndications,
      channel: psChannels,
      article: psArticles,
      topic: psTopics,
    })
    .from(psSyndications)
    .innerJoin(psArticles, eq(psArticles.id, psSyndications.articleId))
    .innerJoin(psTopics, eq(psTopics.id, psArticles.topicId))
    .innerJoin(psChannels, eq(psChannels.id, psSyndications.channelId))
    .where(
      and(
        eq(psSyndications.id, params.syndicationId),
        eq(psTopics.projectId, params.projectId),
        eq(psChannels.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const tags = await tagsFor([row.syndication.id]);
  return { ...row, tags: tags.get(row.syndication.id) ?? [] };
}

// Copies the article in again. What the platform returned (status, ids, URL)
// is kept, so a drafted copy stays linked to its draft.
async function prepare(params: {
  articleId: string;
  channelId: string;
  version: PlatformVersion;
  aiDisclosure: PsAiDisclosure | null;
}) {
  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: psSyndications.id })
    .from(psSyndications)
    .where(
      and(
        eq(psSyndications.articleId, params.articleId),
        eq(psSyndications.channelId, params.channelId),
      ),
    )
    .limit(1);
  const id = existing?.id ?? crypto.randomUUID();
  const fields = {
    platformTitle: params.version.title,
    platformSummary: params.version.summary,
    platformBody: params.version.body,
    updatedAt: now,
  };
  await runBatch((tx) => [
    existing
      ? tx.update(psSyndications).set(fields).where(eq(psSyndications.id, id))
      : tx.insert(psSyndications).values({
          id,
          articleId: params.articleId,
          channelId: params.channelId,
          ...fields,
          aiDisclosure: params.aiDisclosure,
          status: "prepared",
          createdAt: now,
        }),
    tx.delete(psSyndicationTags).where(eq(psSyndicationTags.syndicationId, id)),
    ...(params.version.tags.length > 0
      ? [tx.insert(psSyndicationTags).values(tagRows(id, params.version.tags))]
      : []),
  ]);
  return id;
}

async function saveEdits(
  syndicationId: string,
  edits: PlatformVersion & { aiDisclosure: PsAiDisclosure | null },
) {
  await runBatch((tx) => [
    tx
      .update(psSyndications)
      .set({
        platformTitle: edits.title,
        platformSummary: edits.summary,
        platformBody: edits.body,
        aiDisclosure: edits.aiDisclosure,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(psSyndications.id, syndicationId)),
    tx
      .delete(psSyndicationTags)
      .where(eq(psSyndicationTags.syndicationId, syndicationId)),
    ...(edits.tags.length > 0
      ? [
          tx
            .insert(psSyndicationTags)
            .values(tagRows(syndicationId, edits.tags)),
        ]
      : []),
  ]);
}

// What a send changed: the platform's ids and URL, or the problem.
async function recordSend(
  syndicationId: string,
  patch: {
    status?: PsSyndicationStatus;
    remoteId?: string | null;
    liveUrl?: string | null;
    publishedAt?: string | null;
    error: string | null;
  },
) {
  await db
    .update(psSyndications)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(psSyndications.id, syndicationId));
}

// A first publish moves the topic to Published and its article to ready, as
// moving the topic on the board would.
async function markTopicPublished(projectId: string, topicId: string) {
  const now = new Date().toISOString();
  await runBatch((tx) => [
    tx
      .update(psTopics)
      .set({ status: "published", updatedAt: now })
      .where(and(eq(psTopics.id, topicId), eq(psTopics.projectId, projectId))),
    tx
      .update(psArticles)
      .set({ status: "ready" })
      .where(eq(psArticles.topicId, topicId)),
  ]);
}

// Published copies are the record Phase 5 tracks, so their channel stays.
async function hasPublished(channelId: string) {
  const [row] = await db
    .select({ id: psSyndications.id })
    .from(psSyndications)
    .where(
      and(
        eq(psSyndications.channelId, channelId),
        eq(psSyndications.status, "published"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function deleteSyndication(syndicationId: string) {
  await db.delete(psSyndications).where(eq(psSyndications.id, syndicationId));
}

export const SyndicationRepository = {
  listForArticle,
  getScoped,
  prepare,
  saveEdits,
  recordSend,
  markTopicPublished,
  hasPublished,
  deleteSyndication,
} as const;
