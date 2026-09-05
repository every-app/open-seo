import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  scoreToPercent,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  type StoredLighthousePayload,
  storedLighthousePayloadSchema,
} from "@/server/lib/lighthouseStoredPayload";

// Free Google PageSpeed Insights fallback for the Lighthouse audit, used when
// DataForSEO is unconfigured (DATAFORSEO_AUTH_FAILED). PSI runs real Lighthouse
// and returns its report under `lighthouseResult`, so the stored-payload
// reduction is the same one the DataForSEO path uses.
const PSI_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_REQUEST_TIMEOUT_MS = 90_000;

// PSI expects hyphenated category ids (raw Lighthouse naming), unlike the
// DataForSEO request body which uses underscores.
const PSI_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

export type PagespeedStrategy = "mobile" | "desktop";

// Only the envelope scalars are validated up front; audit/category bodies stay
// as the provider's own objects (the same memory discipline as the DataForSEO
// parser — deep-parsing the multi-MB report OOMed the audit worker once).
const psiResponseSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
  lighthouseResult: z
    .object({
      requestedUrl: z.string().optional(),
      finalUrl: z.string().optional(),
      lighthouseVersion: z.string().optional(),
      categories: z
        .record(z.string(), z.custom<RawLighthouseCategory>())
        .optional(),
      audits: z.record(z.string(), z.custom<RawLighthouseAudit>()).optional(),
    })
    .optional(),
});

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
  strategy: PagespeedStrategy;
}): Promise<StoredLighthousePayload> {
  const params = new URLSearchParams({
    url: input.url,
    strategy: input.strategy,
  });
  for (const category of PSI_CATEGORIES) {
    params.append("category", category);
  }
  const apiKey = await getOptionalEnvValue("PAGESPEED_API_KEY");
  if (apiKey) {
    params.set("key", apiKey);
  }

  let response: Response;
  try {
    response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(PSI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights request failed: ${message}`,
    );
  }

  const parsed = psiResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights returned an invalid response (HTTP ${response.status}): ${summarizeZodIssues(parsed.error)}`,
    );
  }

  if (parsed.data.error) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights request failed (HTTP ${response.status}): ${parsed.data.error.message ?? parsed.data.error.status ?? "unknown error"}`,
    );
  }

  const report = parsed.data.lighthouseResult;
  if (!report) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights response missing lighthouseResult (HTTP ${response.status})`,
    );
  }

  const categories = report.categories ?? {};
  const audits = report.audits ?? {};
  const issueReport = buildStoredLighthouseIssues({ audits, categories });
  const storedPayload: StoredLighthousePayload = {
    version: 2,
    source: "pagespeed-insights",
    hasIssueDetails: issueReport.hasIssueDetails,
    metadata: {
      requestedUrl: report.requestedUrl ?? input.url,
      finalUrl: report.finalUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: report.lighthouseVersion ?? null,
      taskId: null,
      cost: null,
    },
    scores: {
      performance: scoreToPercent(categories.performance?.score),
      accessibility: scoreToPercent(categories.accessibility?.score),
      "best-practices": scoreToPercent(categories["best-practices"]?.score),
      seo: scoreToPercent(categories.seo?.score),
    },
    metrics: buildStoredLighthouseMetrics({ audits }),
    issues: issueReport.issues,
  };

  const allScoresMissing = Object.values(storedPayload.scores).every(
    (score) => score == null,
  );
  if (allScoresMissing) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights returned no category scores for ${storedPayload.metadata.finalUrl}`,
    );
  }

  // Same read-path guarantee as the DataForSEO payload: an off-spec field
  // stored today must not fail to parse (and blank the page) tomorrow.
  const validated = storedLighthousePayloadSchema.safeParse(storedPayload);
  if (!validated.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PageSpeed Insights returned an invalid report: ${summarizeZodIssues(validated.error)}`,
    );
  }

  return storedPayload;
}
