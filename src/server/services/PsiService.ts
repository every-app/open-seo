import { z } from "zod";

const PSI_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

type PsiCategory = (typeof PSI_CATEGORIES)[number];
type PsiStrategy = "mobile" | "desktop";

type PsiAuditMetric = {
  score: number | null;
  displayValue: string | null;
  numericValue: number | null;
};

type PsiAuditResult = {
  requestedUrl: string;
  finalUrl: string;
  strategy: PsiStrategy;
  fetchedAt: string;
  lighthouseVersion: string | null;
  scores: Record<PsiCategory, number | null>;
  metrics: {
    firstContentfulPaint: PsiAuditMetric;
    largestContentfulPaint: PsiAuditMetric;
    totalBlockingTime: PsiAuditMetric;
    cumulativeLayoutShift: PsiAuditMetric;
    speedIndex: PsiAuditMetric;
    timeToInteractive: PsiAuditMetric;
  };
  rawPayload: Record<string, unknown>;
};

type LighthouseAudit = {
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
};

const lighthouseAuditSchema = z.object({
  score: z.number().nullable().optional(),
  displayValue: z.string().optional(),
  numericValue: z.number().optional(),
});

const psiResponseSchema = z
  .object({
    lighthouseResult: z
      .object({
        finalDisplayedUrl: z.string().optional(),
        lighthouseVersion: z.string().optional(),
        categories: z
          .record(
            z.string(),
            z.object({ score: z.number().nullable().optional() }),
          )
          .optional()
          .default({}),
        audits: z
          .record(z.string(), lighthouseAuditSchema)
          .optional()
          .default({}),
      })
      .optional(),
  })
  .passthrough();

const psiErrorSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http and https URLs are supported");
    }
    return parsed.toString();
  } catch {
    throw new Error("Please enter a valid URL");
  }
}

function asScore(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function asMetric(audit: LighthouseAudit | undefined): PsiAuditMetric {
  return {
    score: asScore(audit?.score),
    displayValue: audit?.displayValue ?? null,
    numericValue:
      typeof audit?.numericValue === "number" ? audit.numericValue : null,
  };
}

function extractErrorMessage(payload: unknown): string | null {
  const parsed = psiErrorSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.error?.message ?? null;
}

async function runAudit(input: {
  url: string;
  strategy: PsiStrategy;
  apiKey: string;
}): Promise<PsiAuditResult> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error("PSI API key is required");
  }

  const normalizedUrl = normalizeInputUrl(input.url);
  const params = new URLSearchParams({
    url: normalizedUrl,
    strategy: input.strategy,
  });

  for (const category of PSI_CATEGORIES) {
    params.append("category", category);
  }

  params.append("key", apiKey);

  const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new Error(message ?? `PSI request failed (${response.status})`);
  }

  const parsedPayload = psiResponseSchema.safeParse(payload);
  if (!parsedPayload.success || !parsedPayload.data.lighthouseResult) {
    throw new Error("PSI returned an invalid response");
  }

  const lighthouseResult = parsedPayload.data.lighthouseResult;

  const categories = lighthouseResult.categories ?? {};
  const audits: Record<string, LighthouseAudit> = lighthouseResult.audits ?? {};

  return {
    requestedUrl: normalizedUrl,
    finalUrl: lighthouseResult.finalDisplayedUrl ?? normalizedUrl,
    strategy: input.strategy,
    fetchedAt: new Date().toISOString(),
    lighthouseVersion: lighthouseResult.lighthouseVersion ?? null,
    scores: {
      performance: asScore(categories.performance?.score),
      accessibility: asScore(categories.accessibility?.score),
      "best-practices": asScore(categories["best-practices"]?.score),
      seo: asScore(categories.seo?.score),
    },
    metrics: {
      firstContentfulPaint: asMetric(audits["first-contentful-paint"]),
      largestContentfulPaint: asMetric(audits["largest-contentful-paint"]),
      totalBlockingTime: asMetric(audits["total-blocking-time"]),
      cumulativeLayoutShift: asMetric(audits["cumulative-layout-shift"]),
      speedIndex: asMetric(audits["speed-index"]),
      timeToInteractive: asMetric(audits.interactive),
    },
    rawPayload: isRecord(payload) ? payload : {},
  };
}

export const PsiService = {
  runAudit,
} as const;
