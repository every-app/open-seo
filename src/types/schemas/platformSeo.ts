import { z } from "zod";
import {
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
