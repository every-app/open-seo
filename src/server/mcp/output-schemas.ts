import { z } from "zod";

const mcpMetaOutputSchema = z
  .object({
    url: z.string().optional(),
    organizationId: z.string().optional(),
    projectId: z.string().optional(),
    runId: z.string().optional(),
    creditsCharged: z.number().optional(),
    creditsRemaining: z.number().optional(),
  })
  .passthrough();

// Tools that pass DataForSEO rows straight through to structuredContent hand the
// MCP SDK typed class instances (e.g. DataforseoLabsSerpCompetitorsLiveItem), not
// plain objects. Zod 4's z.record() requires a plain-object prototype and rejects
// class instances ("expected record, received <ClassName>"), which the SDK surfaces
// as a -32602 output validation error. A loose object schema accepts any object
// shape, so it validates both plain rows and typed instances.
export const looseObjectOutputSchema = z.object({}).passthrough();

export const optionalMetaOutputSchema = {
  meta: mcpMetaOutputSchema.optional(),
} as const;
