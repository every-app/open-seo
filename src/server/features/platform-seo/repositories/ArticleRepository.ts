import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { psArticles, psTopics } from "@/db/schema";
import type { PsArticleStatus } from "@/shared/platform-seo";

// Callers check the topic belongs to the project first; an article is reached
// only through its topic.

async function getArticle(topicId: string) {
  const [row] = await db
    .select()
    .from(psArticles)
    .where(eq(psArticles.topicId, topicId))
    .limit(1);
  return row ?? null;
}

// Saving text never changes the article's status.
async function saveArticle(params: {
  topicId: string;
  canonicalTitle: string;
  bodyMarkdown: string;
}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(psArticles)
    .values({
      id: crypto.randomUUID(),
      ...params,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: psArticles.topicId,
      set: {
        canonicalTitle: params.canonicalTitle,
        bodyMarkdown: params.bodyMarkdown,
        updatedAt: now,
      },
    })
    .returning({ updatedAt: psArticles.updatedAt });
  return row.updatedAt;
}

// Ready moves an idea or drafting topic to Ready; back to draft moves a Ready
// topic back to Drafting. A published topic keeps its status either way.
async function setStatus(params: {
  projectId: string;
  topicId: string;
  status: PsArticleStatus;
}) {
  const now = new Date().toISOString();
  const topicScope = and(
    eq(psTopics.id, params.topicId),
    eq(psTopics.projectId, params.projectId),
  );
  await runBatch((tx) => [
    tx
      .update(psArticles)
      .set({ status: params.status, updatedAt: now })
      .where(eq(psArticles.topicId, params.topicId)),
    params.status === "ready"
      ? tx
          .update(psTopics)
          .set({ status: "ready", updatedAt: now })
          .where(
            and(topicScope, inArray(psTopics.status, ["idea", "drafting"])),
          )
      : tx
          .update(psTopics)
          .set({ status: "drafting", updatedAt: now })
          .where(and(topicScope, eq(psTopics.status, "ready"))),
  ]);
}

export const ArticleRepository = {
  getArticle,
  saveArticle,
  setStatus,
} as const;
