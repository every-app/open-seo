import { z } from "zod";

// Tools author schemas as either a raw Zod shape (most tools) or a full
// z.object (the GA4 tools). The SDK accepts both; this normalization exists so
// TS overload resolution stays simple and instrumentation receives a real
// ZodType to validate with.
export function objectSchema(schema: z.ZodType | z.ZodRawShape): z.ZodType;
export function objectSchema(
  schema: z.ZodType | z.ZodRawShape | undefined,
): z.ZodType | undefined;
export function objectSchema(schema: z.ZodType | z.ZodRawShape | undefined) {
  if (!schema) return undefined;
  return schema instanceof z.ZodType ? schema : z.object(schema);
}

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

export const backlinksProfileOutputSchema = z
  .object({
    rows: z.array(looseObjectOutputSchema),
    totalCount: z.number().nullable(),
    hasMore: z.boolean(),
    page: z.number(),
    pageSize: z.number(),
    fetchedAt: z.string().optional(),
  })
  .passthrough();

export const optionalMetaOutputSchema = {
  meta: mcpMetaOutputSchema.optional(),
} as const;
