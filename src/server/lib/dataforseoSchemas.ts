import { z } from "zod";
import { AppError } from "@/server/lib/errors";

const dataforseoTaskSchema = z
  .object({
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    path: z.array(z.string()),
    cost: z.number(),
    result_count: z.number().nullable(),
    result: z
      .array(
        z
          .object({
            items: z.array(z.unknown()).nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

export type DataforseoTask = z.infer<typeof dataforseoTaskSchema>;
export const successfulDataforseoTaskSchema = dataforseoTaskSchema;

export const dataforseoResponseSchema = z
  .object({
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    tasks: z.array(dataforseoTaskSchema).optional(),
  })
  .passthrough();

const monthlySearchSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    search_volume: z.number().nullable(),
  })
  .passthrough();

const keywordInfoSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.number().nullable().optional(),
    monthly_searches: z.array(monthlySearchSchema).nullable().optional(),
  })
  .passthrough();

const keywordInfoWithClickstreamSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    monthly_searches: z.array(monthlySearchSchema).nullable().optional(),
  })
  .passthrough();

const searchIntentInfoSchema = z
  .object({
    main_intent: z.string().nullable().optional(),
  })
  .passthrough();

const keywordPropertiesSchema = z
  .object({
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

export const relatedKeywordItemSchema = z
  .object({
    keyword_data: z
      .object({
        keyword: z.string().optional(),
        keyword_info: keywordInfoSchema.optional(),
        keyword_info_normalized_with_clickstream:
          keywordInfoWithClickstreamSchema.optional(),
        search_intent_info: searchIntentInfoSchema.nullable().optional(),
        keyword_properties: keywordPropertiesSchema.nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const labsKeywordDataItemSchema = z
  .object({
    keyword: z.string(),
    keyword_info: keywordInfoSchema.optional(),
    keyword_info_normalized_with_clickstream:
      keywordInfoWithClickstreamSchema.optional(),
    search_intent_info: searchIntentInfoSchema.nullable().optional(),
    keyword_properties: keywordPropertiesSchema.nullable().optional(),
  })
  .passthrough();

const domainMetricsValueSchema = z
  .object({
    etv: z.number().nullable().optional(),
    count: z.number().nullable().optional(),
  })
  .passthrough();

export const domainMetricsItemSchema = z
  .object({
    metrics: z.record(
      z.string(),
      domainMetricsValueSchema.nullable().optional(),
    ),
  })
  .passthrough();

export const relevantPagesItemSchema = z
  .object({
    page_address: z.string().nullable().optional(),
    metrics: z
      .record(z.string(), domainMetricsValueSchema.nullable().optional())
      .nullable()
      .optional(),
  })
  .passthrough();

const rankedKeywordInfoSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

const rankedKeywordDataSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    keyword_info: rankedKeywordInfoSchema.nullable().optional(),
    keyword_properties: keywordPropertiesSchema.nullable().optional(),
  })
  .passthrough();

const rankedSerpItemSchema = z
  .object({
    url: z.string().nullable().optional(),
    relative_url: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
  })
  .passthrough();

const rankedSerpElementSchema = z
  .object({
    serp_item: rankedSerpItemSchema.nullable().optional(),
    url: z.string().nullable().optional(),
    relative_url: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
  })
  .passthrough();

export const domainRankedKeywordItemSchema = z
  .object({
    keyword_data: rankedKeywordDataSchema.nullable().optional(),
    ranked_serp_element: rankedSerpElementSchema.nullable().optional(),
    keyword: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

export const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().nullable().optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const keywordOverviewItemSchema = z
  .object({
    keyword: z.string(),
    keyword_info: keywordInfoSchema.optional(),
    keyword_properties: keywordPropertiesSchema.nullable().optional(),
    search_intent_info: searchIntentInfoSchema.nullable().optional(),
  })
  .passthrough();

export type KeywordOverviewItem = z.infer<typeof keywordOverviewItemSchema>;
export type RelatedKeywordItem = z.infer<typeof relatedKeywordItemSchema>;
export type LabsKeywordDataItem = z.infer<typeof labsKeywordDataItemSchema>;
export type DomainMetricsItem = z.infer<typeof domainMetricsItemSchema>;
export type DomainRankedKeywordItem = z.infer<
  typeof domainRankedKeywordItemSchema
>;
export type RelevantPagesItem = z.infer<typeof relevantPagesItemSchema>;
export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

export function parseTaskItems<T extends z.ZodType>(
  endpointName: string,
  task: DataforseoTask,
  itemSchema: T,
): z.infer<T>[] {
  const parsed = z.array(itemSchema).safeParse(task.result?.[0]?.items ?? []);
  if (!parsed.success) {
    console.error(
      `dataforseo.${endpointName}.invalid-payload`,
      parsed.error.issues.slice(0, 5),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${endpointName} returned an invalid response shape`,
    );
  }
  return parsed.data;
}
