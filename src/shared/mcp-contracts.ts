import { z } from "zod";

export enum WidgetTool {
  SearchConsole = "get_search_console_performance",
  Serp = "get_serp_results",
}

export const MCP_WIDGET_URI = "ui://openseo/research-v1.html";

export const mcpMetaOutputSchema = z.looseObject({
  url: z.string().optional(),
  projectId: z.string().optional(),
  runId: z.string().optional(),
  creditsCharged: z.number().optional(),
  creditsRemaining: z.number().optional(),
});

export const widgetContextSchema = z.object({
  tool: z.enum(WidgetTool),
  arguments: z.record(z.string(), z.unknown()),
});

export type WidgetContext = z.infer<typeof widgetContextSchema>;

export const widgetSnapshotSchema = z.object({
  context: widgetContextSchema,
  data: z.record(z.string(), z.unknown()),
  text: z.string(),
});

export type WidgetSnapshot = z.infer<typeof widgetSnapshotSchema>;

export const searchConsoleSchema = z.looseObject({
  resultId: z
    .string()
    .optional()
    .describe(
      "Saved result reference for optional show_search_console_performance, including the Google connection prompt. Valid for one hour; displaying it uses no credits.",
    ),
  ok: z.boolean(),
  reason: z.string().optional(),
  connectionRequired: z.boolean().optional(),
  connectUrl: z.string().optional(),
  setupDocsUrl: z.string().optional(),
  siteUrl: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dimensions: z.array(z.string()).optional(),
  rowCount: z.number().optional(),
  rows: z
    .array(
      z.looseObject({
        keys: z.array(z.string()).optional(),
        clicks: z.number(),
        impressions: z.number(),
        ctr: z.number(),
        // Google omits position for discover and googleNews searches.
        position: z.number().optional(),
      }),
    )
    .optional(),
  hasMore: z.boolean().optional(),
  nextStartRow: z.number().optional(),
  meta: mcpMetaOutputSchema.optional(),
});

export type SearchConsoleData = z.infer<typeof searchConsoleSchema>;

export const serpItemSchema = z.looseObject({
  type: z.string().nullish(),
  rank: z.number().nullable(),
  // Older cached SERPs may not include an organic rank.
  organicRank: z.number().nullish(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  description: z.string().nullable(),
});

export const serpSchema = z.looseObject({
  resultId: z
    .string()
    .optional()
    .describe(
      "Saved result reference for optional show_serp_results. Valid for one hour; displaying it uses no credits and makes no research request.",
    ),
  results: z.array(
    z.discriminatedUnion("ok", [
      z.looseObject({
        keyword: z.string(),
        ok: z.literal(true),
        locationCode: z.number().optional(),
        languageCode: z.string().optional(),
        locationName: z.string().optional(),
        device: z.string().optional(),
        items: z.array(serpItemSchema),
      }),
      z.looseObject({
        keyword: z.string(),
        ok: z.literal(false),
        error: z.string(),
      }),
    ]),
  ),
  meta: mcpMetaOutputSchema.optional(),
});

export type SerpData = z.infer<typeof serpSchema>;
