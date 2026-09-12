import { z } from "zod";

export const AGENT_MARKETPLACE_PLATFORMS = [
  "openai",
  "claude",
  "claude_community",
  "grok",
  "cursor",
  "mcp_directory",
  "skills_sh",
] as const;

export const agentMarketplacePlatformSchema = z.enum(
  AGENT_MARKETPLACE_PLATFORMS,
);

export const agentMarketplaceStatusSchema = z.enum([
  "not_started",
  "preparing",
  "submitted",
  "in_review",
  "published",
  "rejected",
  "paused",
]);

const agentMarketplaceSourceSchema = z.enum([
  "manual",
  "github",
  "platform",
  "product",
]);

const optionalTrimmedString = z
  .string()
  .trim()
  .max(2_000)
  .nullable()
  .optional();

export const listAgentMarketplacesSchema = z.object({
  projectId: z.string().min(1),
});

export const updateAgentMarketplaceSchema = z.object({
  projectId: z.string().min(1),
  platform: agentMarketplacePlatformSchema,
  status: agentMarketplaceStatusSchema,
  providerStatus: z.string().trim().max(200).nullable().optional(),
  packageVersion: z.string().trim().max(100).nullable().optional(),
  listingUrl: z.url().nullable().optional(),
  submittedAt: z.iso.datetime().nullable().optional(),
  publishedAt: z.iso.datetime().nullable().optional(),
  lastVerifiedAt: z.iso.datetime().nullable().optional(),
  notes: optionalTrimmedString,
});

const countSchema = z.number().int().nonnegative().max(1_000_000_000);

export const addAgentMarketplaceEvidenceSchema = z.object({
  projectId: z.string().min(1),
  platform: agentMarketplacePlatformSchema,
  capturedAt: z.iso.datetime(),
  source: agentMarketplaceSourceSchema,
  views: countSchema.default(0),
  uniqueViewers: countSchema.default(0),
  clones: countSchema.default(0),
  uniqueCloners: countSchema.default(0),
  installs: countSchema.default(0),
  oauthStarts: countSchema.default(0),
  oauthCompletions: countSchema.default(0),
  activatedAccounts: countSchema.default(0),
  qualifiedOutcomes: countSchema.default(0),
  notes: optionalTrimmedString,
});

export type AgentMarketplacePlatform = z.infer<
  typeof agentMarketplacePlatformSchema
>;
export type AgentMarketplaceStatus = z.infer<
  typeof agentMarketplaceStatusSchema
>;
export type UpdateAgentMarketplaceInput = z.infer<
  typeof updateAgentMarketplaceSchema
>;
export type AddAgentMarketplaceEvidenceInput = z.infer<
  typeof addAgentMarketplaceEvidenceSchema
>;
