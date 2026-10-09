import { z } from "zod";
import { scheduleTimeSchema } from "./schedule-time";

export const aiEngineSchema = z.enum([
  "chatgpt",
  "gemini",
  "google_ai_overview",
  "claude",
  "perplexity",
]);
export const aiProjectSchema = z.object({ projectId: z.string().min(1) });
const topicSchema = z.string().trim().min(1).max(100);
const scheduleIntervalSchema = z
  .enum(["daily", "weekly", "monthly"])
  .describe(
    "How often scheduled tracking runs. Monthly runs on the last day of the month.",
  );
export const aiTrackerPatchSchema = z.object({
  engines: z
    .array(aiEngineSchema)
    .min(1)
    .max(aiEngineSchema.options.length)
    .optional(),
  locationCode: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Country for collection, as a DataForSEO location code from the project market list (2840 = United States). A new tracker defaults to the project's market. Check capabilities for countries an engine cannot use.",
    ),
  languageCode: z
    .string()
    .min(2)
    .max(8)
    .optional()
    .describe(
      "Language for collection. Omit when changing country to use that country's default language.",
    ),
  prompts: z
    .array(
      z.object({
        id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Existing prompt ID when editing or pausing. Omit for a new prompt. Changing an existing prompt's text archives it and adds the new text as a new prompt, so earlier answers keep their exact prompt.",
          ),
        text: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .describe(
            "Exact customer prompt or keyword, up to 2,000 characters; casing is preserved. Do not expand or rewrite without the user's direction.",
          ),
        topic: topicSchema
          .optional()
          .describe(
            "Topic name that groups the prompt. New prompts default to General; edits without a topic keep the saved topic. Set it on an existing prompt to move the prompt; to rename a topic, move every prompt in it.",
          ),
        paused: z.boolean().optional(),
      }),
    )
    .max(100)
    .optional(),
  archivePromptIds: z.array(z.string().uuid()).max(100).optional(),
});
export const saveAiTrackerSchema = aiProjectSchema.extend(
  aiTrackerPatchSchema.shape,
);
export const estimateAiCostSchema = aiProjectSchema.extend({
  scheduleInterval: scheduleIntervalSchema
    .optional()
    .describe(
      "Cadence for the monthly cost estimate. Defaults to the saved schedule, or weekly.",
    ),
  patch: aiTrackerPatchSchema
    .optional()
    .describe("Optional proposed changes to estimate before saving."),
  promptIds: z.array(z.string().uuid()).min(1).max(100).optional(),
});
export const setAiScheduleSchema = aiProjectSchema.extend({
  enabled: z.boolean(),
  scheduleInterval: scheduleIntervalSchema
    .optional()
    .describe(
      "Cadence when enabling. Defaults to the saved schedule, or weekly. Ignored when pausing.",
    ),
  scheduleTime: scheduleTimeSchema
    .optional()
    .describe(
      "Run time when enabling. Omit to keep the current next check when the cadence is unchanged, or to pick a time between 04:00 and 10:00 UTC.",
    ),
});
export const runAiCheckSchema = aiProjectSchema.extend({
  maxCostUsd: z
    .number()
    .positive()
    .max(100)
    .describe(
      "The most the user approved for this one check: runNowCostUsd from estimate_ai_visibility_cost. The check is refused if its current cost is higher.",
    ),
  promptIds: z.array(z.string().uuid()).min(1).max(100).optional(),
});
export const getAiRunSchema = aiProjectSchema.extend({
  runId: z.string().uuid(),
});
export const aiResultsSchema = aiProjectSchema.extend({
  runId: z
    .string()
    .uuid()
    .nullish()
    .describe(
      "Omit or null for the latest baseline/scheduled run. Reuse the returned runId for related source/answer reads. Do not use the string all.",
    ),
  topic: topicSchema
    .nullish()
    .describe(
      "Omit or null for all topics in the run. Filter by an exact saved topic name only when requested; do not use the string all.",
    ),
  engines: z
    .array(aiEngineSchema)
    .max(aiEngineSchema.options.length)
    .nullish()
    .describe(
      "Omit or null for all engines in one call. Provide one or more engines for an explicitly requested subset, or an empty array for no engines. Do not make separate calls for each engine or use the string all.",
    ),
  promptId: z
    .string()
    .uuid()
    .nullish()
    .describe(
      "Omit or null for all prompts in the run. Provide an exact prompt ID only when requested; includeHistory returns that prompt's prior observations. Do not use the string all.",
    ),
  includeHistory: z.boolean().default(false),
  competitorGap: z
    .boolean()
    .default(false)
    .describe(
      "Use false for the initial review, overall sources and branded diagnostics. True restricts rows to answers where a competitor appears and your brand is absent; an empty gap subset does not mean answer details are missing.",
    ),
  branded: z.enum(["all", "neutral", "branded"]).default("neutral"),
  cursor: z
    .string()
    .regex(/^\d+$/)
    .nullish()
    .describe(
      "Omit or null for the first page. Use only a returned nextCursor for another page; do not use the string all.",
    ),
  limit: z.number().int().min(1).max(50).default(25),
});
export const aiSourcesSchema = aiResultsSchema.extend({
  groupBy: z.enum(["url", "domain"]).default("url"),
  ownership: z.enum(["all", "own", "competitor", "other"]).default("all"),
});
export const aiTrendSchema = aiProjectSchema.extend({
  days: z
    .union([z.literal(7), z.literal(28), z.literal(90)])
    .default(7)
    .describe(
      "Length of each period. Compares the latest N days with the N days before.",
    ),
});
export const aiAnswerSchema = aiProjectSchema.extend({
  observationId: z.string().uuid(),
});
export const aiExportSchema = aiResultsSchema.extend({
  format: z.enum(["json", "csv"]).default("json"),
});

export type AiTrackerPatch = z.infer<typeof aiTrackerPatchSchema>;
export type SaveAiTrackerInput = z.infer<typeof saveAiTrackerSchema>;
export type EstimateAiCostInput = z.infer<typeof estimateAiCostSchema>;
export type SetAiScheduleInput = z.infer<typeof setAiScheduleSchema>;
export type RunAiCheckInput = z.infer<typeof runAiCheckSchema>;
export type AiResultsInput = z.infer<typeof aiResultsSchema>;
export type AiSourcesInput = z.infer<typeof aiSourcesSchema>;
export type AiExportInput = z.infer<typeof aiExportSchema>;
export type AiTrendInput = z.infer<typeof aiTrendSchema>;
