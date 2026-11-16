import {
  bodyToSend,
  hashnodeTag,
  normalizeTags,
  preparePlatformVersion,
} from "../channels/adapter";
import type { ChannelResult } from "../channels/channelResult";
import {
  createDevtoDraft,
  type DevtoArticleInput,
  updateDevtoArticle,
} from "../channels/devto";
import {
  createHashnodeDraft,
  HASHNODE_MAX_BODY_BYTES,
  type HashnodePostInput,
  publishHashnodeDraft,
  updateHashnodeDraft,
  updateHashnodePost,
} from "../channels/hashnode";
import { ArticleRepository } from "../repositories/ArticleRepository";
import { ChannelRepository } from "../repositories/ChannelRepository";
import { SyndicationRepository as repo } from "../repositories/SyndicationRepository";
import { TopicRepository } from "../repositories/TopicRepository";
import { openChannelToken } from "./ChannelService";
import { AppError } from "@/server/lib/errors";
import { PS_CHANNEL_LABELS, type PsAiDisclosure } from "@/shared/platform-seo";

type Scope = { projectId: string; organizationId: string };

// The outcome of a send, as data: the client only sees error codes, and a
// platform's refusal is something the user acts on.
type SendOutcome = { ok: true } | { ok: false; message: string };

async function requireArticle(projectId: string, topicId: string) {
  const topic = await TopicRepository.getTopicRow(projectId, topicId);
  if (!topic) throw new AppError("NOT_FOUND");
  const article = await ArticleRepository.getArticle(topic.id);
  return { topic, article };
}

async function requireSyndication(scope: Scope, syndicationId: string) {
  const row = await repo.getScoped({ ...scope, syndicationId });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

// ---------------------------------------------------------------------------
// The publish page
// ---------------------------------------------------------------------------
async function getPublishing(scope: Scope, topicId: string) {
  const { topic, article } = await requireArticle(scope.projectId, topicId);
  const [channels, syndications] = await Promise.all([
    ChannelRepository.listChannels(scope.organizationId),
    article ? repo.listForArticle(article.id) : Promise.resolve([]),
  ]);
  return {
    topic: { id: topic.id, title: topic.title, status: topic.status },
    article: article
      ? {
          title: article.canonicalTitle,
          status: article.status,
          canonicalUrl: article.canonicalUrl,
          hasBody: article.bodyMarkdown.trim() !== "",
        }
      : null,
    channels,
    syndications: syndications.map(
      ({ articleId: _articleId, ...syndication }) => syndication,
    ),
  };
}

async function setCanonicalUrl(
  scope: Scope,
  topicId: string,
  canonicalUrl: string | null,
) {
  const { topic, article } = await requireArticle(scope.projectId, topicId);
  if (!article)
    throw new AppError("VALIDATION_ERROR", "Write the article first.");
  await ArticleRepository.setCanonicalUrl(topic.id, canonicalUrl);
  return { ok: true };
}

// Copies the saved article into the channel's version (again, if it was
// prepared before), ready to edit.
async function prepare(scope: Scope, topicId: string, channelId: string) {
  const { topic, article } = await requireArticle(scope.projectId, topicId);
  if (!article?.bodyMarkdown.trim()) {
    throw new AppError("VALIDATION_ERROR", "Write the article first.");
  }
  const channel = await ChannelRepository.getChannelWithToken(
    scope.organizationId,
    channelId,
  );
  if (!channel) throw new AppError("NOT_FOUND");
  const syndicationId = await repo.prepare({
    articleId: article.id,
    channelId: channel.id,
    version: preparePlatformVersion({
      type: channel.type,
      title: article.canonicalTitle,
      body: article.bodyMarkdown,
      primaryKeyword: topic.primaryKeyword,
    }),
    aiDisclosure: channel.type === "devto" ? "some_ai" : null,
  });
  return { syndicationId };
}

async function saveEdits(
  scope: Scope,
  syndicationId: string,
  edits: {
    title: string;
    summary: string | null;
    body: string;
    tags: string[];
    aiDisclosure: PsAiDisclosure | null;
  },
) {
  const { channel } = await requireSyndication(scope, syndicationId);
  const tags = normalizeTags(channel.type, edits.tags);
  await repo.saveEdits(syndicationId, {
    ...edits,
    title: edits.title.trim(),
    summary: edits.summary?.trim() || null,
    tags,
    aiDisclosure: channel.type === "devto" ? edits.aiDisclosure : null,
  });
  return { tags };
}

// Removes the copy here; a draft or post on the platform stays there.
async function remove(scope: Scope, syndicationId: string) {
  const { syndication } = await requireSyndication(scope, syndicationId);
  if (syndication.status === "published") {
    throw new AppError(
      "VALIDATION_ERROR",
      "A published copy is kept for tracking.",
    );
  }
  await repo.deleteSyndication(syndication.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
type Scoped = Awaited<ReturnType<typeof requireSyndication>>;

function devtoInput(row: Scoped): DevtoArticleInput {
  return {
    title: row.syndication.platformTitle,
    bodyMarkdown: bodyToSend(
      row.syndication.platformBody,
      row.article.canonicalUrl,
    ),
    description: row.syndication.platformSummary,
    tags: row.tags,
    canonicalUrl: row.article.canonicalUrl,
    aiDisclosure: row.syndication.aiDisclosure,
  };
}

function hashnodeInput(row: Scoped): HashnodePostInput {
  return {
    title: row.syndication.platformTitle,
    subtitle: row.syndication.platformSummary,
    contentMarkdown: bodyToSend(
      row.syndication.platformBody,
      row.article.canonicalUrl,
    ),
    tags: row.tags.map(hashnodeTag),
    originalArticleURL: row.article.canonicalUrl,
  };
}

async function finish<T>(
  row: Scoped,
  result: ChannelResult<T>,
  onSuccess: (value: T) => Parameters<typeof repo.recordSend>[1],
): Promise<SendOutcome> {
  const { syndication, channel } = row;
  if (!result.ok) {
    // The platform draft is gone: deleted there, or published from the
    // platform's own dashboard (a Hashnode draft is consumed when it
    // publishes). The copy goes back to unsent, edits kept, rather than stay
    // stuck pointing at a draft that can't be updated.
    if (
      result.problem.kind === "not_found" &&
      syndication.status === "drafted"
    ) {
      const message = `${PS_CHANNEL_LABELS[channel.type]} no longer has this draft. If you published it from your ${PS_CHANNEL_LABELS[channel.type]} dashboard, it's already live there; otherwise send this copy again as a new draft.`;
      await repo.recordSend(syndication.id, {
        status: "prepared",
        remoteId: null,
        error: message,
      });
      return { ok: false, message };
    }
    await repo.recordSend(syndication.id, { error: result.problem.message });
    return { ok: false, message: result.problem.message };
  }
  await repo.recordSend(syndication.id, onSuccess(result.value));
  return { ok: true };
}

function tooLong(row: Scoped): SendOutcome | null {
  if (row.channel.type !== "hashnode") return null;
  const bytes = new TextEncoder().encode(
    hashnodeInput(row).contentMarkdown,
  ).length;
  return bytes > HASHNODE_MAX_BODY_BYTES
    ? {
        ok: false,
        message:
          "Hashnode accepts posts up to about 95 KB of text. Shorten this copy first.",
      }
    : null;
}

// Creates the platform draft, or sends the latest text to the existing draft
// or live post.
async function sendDraft(
  scope: Scope,
  syndicationId: string,
): Promise<SendOutcome> {
  const row = await requireSyndication(scope, syndicationId);
  const { syndication, channel } = row;
  const blocked = tooLong(row);
  if (blocked) return blocked;
  const token = await openChannelToken(channel.tokenCiphertext);
  const remoteId = syndication.remoteId;

  if (channel.type === "devto") {
    const input = devtoInput(row);
    const result = remoteId
      ? await updateDevtoArticle(token, remoteId, input, false)
      : await createDevtoDraft(token, input);
    return finish(row, result, (article) => ({
      remoteId: article.id,
      status: syndication.status === "published" ? "published" : "drafted",
      // A draft's URL is a private preview slug; only a live post has one.
      liveUrl: syndication.status === "published" ? article.url : null,
      error: null,
    }));
  }

  if (!channel.publicationId) throw new AppError("INTERNAL_ERROR");
  const input = hashnodeInput(row);
  if (syndication.status === "published" && remoteId) {
    return finish(
      row,
      await updateHashnodePost(token, remoteId, input),
      (post) => ({
        liveUrl: post.url,
        error: null,
      }),
    );
  }
  const result = remoteId
    ? await updateHashnodeDraft(token, remoteId, input)
    : await createHashnodeDraft(token, channel.publicationId, input);
  return finish(row, result, (draft) => ({
    remoteId: draft.id,
    status: "drafted",
    error: null,
  }));
}

// Takes a platform draft live with the latest text, and the topic with it.
async function publish(
  scope: Scope,
  syndicationId: string,
): Promise<SendOutcome> {
  const row = await requireSyndication(scope, syndicationId);
  const { syndication, channel } = row;
  if (syndication.status !== "drafted" || !syndication.remoteId) {
    throw new AppError("VALIDATION_ERROR", "Send it as a draft first.");
  }
  const blocked = tooLong(row);
  if (blocked) return blocked;
  const token = await openChannelToken(channel.tokenCiphertext);
  const draftId = syndication.remoteId;

  let outcome: SendOutcome;
  if (channel.type === "devto") {
    outcome = await finish(
      row,
      await updateDevtoArticle(token, draftId, devtoInput(row), true),
      (article) => ({
        status: "published",
        liveUrl: article.url,
        publishedAt: article.publishedAt ?? new Date().toISOString(),
        error: null,
      }),
    );
  } else {
    // publishDraft takes no text, so the draft gets the latest first.
    const updated = await updateHashnodeDraft(
      token,
      draftId,
      hashnodeInput(row),
    );
    outcome = updated.ok
      ? await finish(
          row,
          await publishHashnodeDraft(token, draftId),
          (post) => ({
            status: "published",
            remoteId: post.id,
            liveUrl: post.url,
            publishedAt: post.publishedAt,
            error: null,
          }),
        )
      : await finish(row, updated, () => ({ error: null }));
  }
  if (outcome.ok) {
    await repo.markTopicPublished(scope.projectId, row.topic.id);
  }
  return outcome;
}

export const SyndicationService = {
  getPublishing,
  setCanonicalUrl,
  prepare,
  saveEdits,
  remove,
  sendDraft,
  publish,
} as const;
