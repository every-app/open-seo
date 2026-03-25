import { z } from "zod";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  scoreToPercent,
  type StoredLighthousePayload,
} from "@/server/lib/lighthouseStoredPayload";

export const requestCategories = [
  "performance",
  "accessibility",
  "best_practices",
  "seo",
] as const;

export type LighthouseStrategy = "mobile" | "desktop";

const lighthouseAuditItemsSchema = z
  .union([
    z.array(z.record(z.string(), z.unknown())),
    z.record(z.string(), z.unknown()),
  ])
  .transform((items) => (Array.isArray(items) ? items : [items]));

const lighthouseAuditSchema = z
  .object({
    score: z.number().nullable().optional(),
    displayValue: z.string().optional(),
    numericValue: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    scoreDisplayMode: z.string().optional(),
    details: z
      .object({
        overallSavingsMs: z.number().optional(),
        overallSavingsBytes: z.number().optional(),
        items: lighthouseAuditItemsSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const lighthouseCategorySchema = z
  .object({
    score: z.number().nullable().optional(),
    auditRefs: z
      .array(
        z
          .object({
            id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const lighthouseResponseSchema = z
  .object({
    requestedUrl: z.string().optional(),
    finalUrl: z.string().optional(),
    lighthouseVersion: z.string().optional(),
    categories: z
      .record(z.string(), lighthouseCategorySchema)
      .optional()
      .default({}),
    audits: z.record(z.string(), lighthouseAuditSchema).optional().default({}),
  })
  .passthrough();

const dataforseoTaskSchema = z
  .object({
    id: z.string().optional(),
    cost: z.number().optional(),
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    result: z.array(lighthouseResponseSchema).optional(),
  })
  .passthrough();

const dataforseoLighthouseResponseSchema = z
  .object({
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    tasks: z.array(dataforseoTaskSchema).optional(),
  })
  .passthrough();

function summarizeZodIssues(error: z.ZodError, maxIssues = 3): string {
  return error.issues
    .slice(0, maxIssues)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseDataforseoLighthousePayload(
  payload: unknown,
  input: { url: string; strategy: LighthouseStrategy },
): StoredLighthousePayload {
  const parsed = dataforseoLighthouseResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `DataForSEO Lighthouse returned an invalid response: ${summarizeZodIssues(parsed.error)}`,
    );
  }

  if (parsed.data.status_code !== 20000) {
    throw new Error(
      parsed.data.status_message ?? "DataForSEO Lighthouse request failed",
    );
  }

  const task = parsed.data.tasks?.[0];
  if (!task) {
    throw new Error("DataForSEO Lighthouse response missing task");
  }

  if (task.status_code !== 20000) {
    throw new Error(task.status_message ?? "DataForSEO Lighthouse task failed");
  }

  const result = task.result?.[0];
  if (!result) {
    throw new Error("DataForSEO Lighthouse response missing result");
  }

  const fetchedAt = new Date().toISOString();
  const categories: Record<string, RawLighthouseCategory> =
    result.categories ?? {};
  const audits: Record<string, RawLighthouseAudit> = result.audits ?? {};
  const issueReport = buildStoredLighthouseIssues({ audits, categories });
  const metrics = buildStoredLighthouseMetrics({ audits });
  const storedPayload: StoredLighthousePayload = {
    version: 2,
    source: "dataforseo-lighthouse",
    hasIssueDetails: issueReport.hasIssueDetails,
    metadata: {
      requestedUrl: result.requestedUrl ?? input.url,
      finalUrl: result.finalUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt,
      lighthouseVersion: result.lighthouseVersion ?? null,
      taskId: task.id ?? null,
      cost: task.cost ?? null,
    },
    scores: {
      performance: scoreToPercent(categories.performance?.score),
      accessibility: scoreToPercent(categories.accessibility?.score),
      "best-practices": scoreToPercent(categories["best-practices"]?.score),
      seo: scoreToPercent(categories.seo?.score),
    },
    metrics,
    issues: issueReport.issues,
  };

  const allScoresMissing = Object.values(storedPayload.scores).every(
    (score) => score == null,
  );
  if (allScoresMissing) {
    throw new Error(
      `DataForSEO Lighthouse returned no category scores for ${storedPayload.metadata.finalUrl}`,
    );
  }

  return storedPayload;
}
