import { z } from "zod";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  scoreToPercent,
  type StoredLighthousePayload,
} from "@/server/lib/lighthouseStoredPayload";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type LighthouseStrategy = "mobile" | "desktop";

// Google PageSpeed Insights runs Lighthouse on Google's own infrastructure and
// returns the standard Lighthouse report under `lighthouseResult`. It is free,
// but a (free) PAGESPEED_API_KEY is effectively required: keyless requests share
// a tiny global anonymous quota that is almost always exhausted (HTTP 429). With
// a key each project gets ~25k requests/day, which is why the audit only routes
// here when PAGESPEED_API_KEY is set (see src/server/lib/audit/lighthouse.ts)
// and otherwise falls back to DataForSEO OnPage. The report is normalised into
// the exact same StoredLighthousePayload the DataForSEO path produces, so the
// audit UI (scores, metrics, and per-audit issues) is provider-agnostic.
const PSI_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// Lighthouse runs on Google's side are slow; some pages take well over a minute.
const PSI_REQUEST_TIMEOUT_MS = 90_000;
const PSI_REQUEST_CATEGORIES = [
  "PERFORMANCE",
  "ACCESSIBILITY",
  "BEST_PRACTICES",
  "SEO",
] as const;

// Newer Lighthouse (13.x) returns `details.items` as an object for some audits
// (e.g. document-latency-insight) instead of an array. Accept either and
// normalise to an array so one stray audit shape can't fail the whole parse.
const psiAuditItemsSchema = z
  .union([
    z.array(z.record(z.string(), z.unknown())),
    z.record(z.string(), z.unknown()),
  ])
  .transform((items) => (Array.isArray(items) ? items : [items]));

const psiAuditSchema = z
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
        items: psiAuditItemsSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const psiCategorySchema = z
  .object({
    score: z.number().nullable().optional(),
    auditRefs: z
      .array(z.object({ id: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

const psiResponseSchema = z
  .object({
    lighthouseResult: z
      .object({
        requestedUrl: z.string().optional(),
        finalUrl: z.string().optional(),
        finalDisplayedUrl: z.string().optional(),
        lighthouseVersion: z.string().optional(),
        categories: z
          .record(z.string(), psiCategorySchema)
          .optional()
          .default({}),
        audits: z.record(z.string(), psiAuditSchema).optional().default({}),
      })
      .passthrough(),
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

export async function fetchPagespeedLighthouse(input: {
  url: string;
  strategy: LighthouseStrategy;
}): Promise<StoredLighthousePayload> {
  const params = new URLSearchParams();
  params.set("url", input.url);
  params.set("strategy", input.strategy);
  for (const category of PSI_REQUEST_CATEGORIES) {
    params.append("category", category);
  }
  const apiKey = (await getOptionalEnvValue("PAGESPEED_API_KEY"))?.trim();
  if (apiKey) params.set("key", apiKey);

  const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(PSI_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `PageSpeed Insights HTTP ${response.status}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }

  const parsed = psiResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `PageSpeed Insights returned an invalid response: ${summarizeZodIssues(parsed.error)}`,
    );
  }

  const result = parsed.data.lighthouseResult;
  const categories: Record<string, RawLighthouseCategory> =
    result.categories ?? {};
  const audits: Record<string, RawLighthouseAudit> = result.audits ?? {};
  const issueReport = buildStoredLighthouseIssues({ audits, categories });
  const metrics = buildStoredLighthouseMetrics({ audits });

  const storedPayload: StoredLighthousePayload = {
    version: 2,
    source: "pagespeed-insights",
    hasIssueDetails: issueReport.hasIssueDetails,
    metadata: {
      requestedUrl: result.requestedUrl ?? input.url,
      finalUrl: result.finalUrl ?? result.finalDisplayedUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: result.lighthouseVersion ?? null,
      taskId: null,
      // PageSpeed Insights is free; no per-request cost to record.
      cost: 0,
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
      `PageSpeed Insights returned no category scores for ${storedPayload.metadata.finalUrl}`,
    );
  }

  return storedPayload;
}
