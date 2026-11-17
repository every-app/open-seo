import { z } from "zod";
import {
  PS_AI_DISCLOSURES,
  PS_ARTICLE_MAX_CHARS,
  PS_ARTICLE_STATUSES,
  PS_PLATFORM_DECISIONS,
  PS_PLATFORM_STATUSES,
  PS_TOPIC_STATUSES,
} from "@/shared/platform-seo";

const projectIdSchema = z.string().min(1);

export const psProjectSchema = z.object({ projectId: projectIdSchema });

export const psStartPullSchema = z.object({
  projectId: projectIdSchema,
  seed: z.string().trim().min(2).max(120),
  seedMeaning: z.string().trim().max(300).optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const psPullSchema = z.object({
  projectId: projectIdSchema,
  pullId: z.string().min(1),
});

export const psCreateTopicSchema = z.object({
  projectId: projectIdSchema,
  clusterId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
});

// Topics
const topicTitleSchema = z.string().trim().min(1).max(200);
const topicAngleSchema = z.string().trim().max(300);

export const psTopicSchema = z.object({
  projectId: projectIdSchema,
  topicId: z.string().min(1),
});

export const psNewTopicSchema = z.object({
  projectId: projectIdSchema,
  title: topicTitleSchema,
  angle: topicAngleSchema.optional(),
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
});

export const psUpdateTopicSchema = psTopicSchema.extend({
  title: topicTitleSchema.optional(),
  angle: topicAngleSchema.nullable().optional(),
  status: z.enum(PS_TOPIC_STATUSES).optional(),
  primaryKeyword: z.string().trim().min(1).max(200).optional(),
});

// Articles
const articleTextSchema = {
  title: z.string().trim().min(1).max(200),
  body: z.string().max(PS_ARTICLE_MAX_CHARS),
};

export const psSaveArticleSchema = psTopicSchema.extend(articleTextSchema);

export const psArticleStatusSchema = psTopicSchema.extend({
  status: z.enum(PS_ARTICLE_STATUSES),
});

// Syndication. Tokens are bounded but otherwise opaque; the platform checks
// them before anything is stored.
const tokenSchema = z.string().trim().min(8).max(500);

export const psConnectDevtoSchema = z.object({
  projectId: projectIdSchema,
  apiKey: tokenSchema,
});

export const psConnectHashnodeSchema = z.object({
  projectId: projectIdSchema,
  token: tokenSchema,
  publicationId: z.string().trim().min(1).max(100).optional(),
});

export const psChannelSchema = z.object({
  projectId: projectIdSchema,
  channelId: z.string().min(1),
});

export const psPrepareSyndicationSchema = psTopicSchema.extend({
  channelId: z.string().min(1),
});

export const psSyndicationSchema = z.object({
  projectId: projectIdSchema,
  syndicationId: z.string().min(1),
});

export const psSaveSyndicationSchema = psSyndicationSchema.extend({
  title: z.string().trim().min(1).max(250),
  summary: z.string().trim().max(300).nullable(),
  body: z.string().min(1).max(PS_ARTICLE_MAX_CHARS),
  tags: z.array(z.string().trim().min(1).max(60)).max(15),
  aiDisclosure: z.enum(PS_AI_DISCLOSURES).nullable(),
});

// The original on the user's own site: a public http(s) page.
export const psCanonicalUrlSchema = psTopicSchema.extend({
  canonicalUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable(),
});

// Tracking: no ids checks every published copy (up to the per-click cap).
export const psStartTrackingSchema = z.object({
  projectId: projectIdSchema,
  syndicationIds: z.array(z.string().min(1)).min(1).max(25).optional(),
});

// Platform discovery
export const psSetPlatformStatusSchema = z.object({
  projectId: projectIdSchema,
  platformId: z.string().min(1),
  status: z.enum(PS_PLATFORM_DECISIONS),
});

// Each keyword costs a two-page SERP, so a lookup is capped like get_serp_results.
export const psFindPlatformsSchema = z.object({
  projectId: projectIdSchema,
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const psOpportunitiesSchema = z.object({
  projectId: projectIdSchema,
  keywords: z.array(z.string().trim().min(1).max(200)).max(500),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(8),
});

// One site per entry, as a URL or a bare domain; size of a pasted list.
export const psImportPlatformsSchema = z.object({
  projectId: projectIdSchema,
  sites: z.array(z.string().trim().min(1).max(500)).min(1).max(1000),
  // pending adds new sites for review and leaves listed ones as they are.
  status: z.enum(PS_PLATFORM_STATUSES),
  affiliateProgram: z.boolean().default(false),
});

export const psSetAffiliateProgramSchema = z.object({
  projectId: projectIdSchema,
  platformId: z.string().min(1),
  affiliateProgram: z.boolean(),
});
