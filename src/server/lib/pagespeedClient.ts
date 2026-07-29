import { z } from "zod";

import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";
import { LIGHTHOUSE_CATEGORIES } from "@/shared/lighthouse";

const PAGESPEED_API_URL =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** PSI audits routinely take 10-30s; anything past this is a hung call, not a
 *  slow one, and should fail the run rather than hold the request open. */
const REQUEST_TIMEOUT_MS = 60_000;

export type PagespeedStrategy = "mobile" | "desktop";

/** A PageSpeed Insights call returned a non-2xx status. 400/403 mean the key
 *  is missing, invalid, or restricted; 429 means the daily quota is spent —
 *  both are surfaced as setup/quota prompts rather than faults. */
export class PagespeedApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "PagespeedApiError";
  }
}

export function isExpectedPagespeedFailure(error: unknown): boolean {
  return (
    error instanceof PagespeedApiError &&
    (error.status === 400 || error.status === 403 || error.status === 429)
  );
}

/** Whether the instance-level PAGESPEED_API_KEY secret is configured. Drives
 *  the setup-card-vs-data UI; mirrors hasVercelToken. A key is mandatory —
 *  the anonymous tier's quota is zero (verified 2026-07-29, see specs/0011). */
export async function hasPagespeedApiKey(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("PAGESPEED_API_KEY"));
}

/** One PSI run, flattened to the columns psi_snapshots stores. */
type PagespeedResult = {
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  ttfbMs: number | null;
  fieldLcpMs: number | null;
  fieldInpMs: number | null;
  fieldCls: number | null;
  fieldOverallCategory: "FAST" | "AVERAGE" | "SLOW" | null;
  fieldSource: "url" | "origin" | null;
  fetchTime: string | null;
};

const metricSchema = z.looseObject({
  percentile: z.number().optional(),
  category: z.string().optional(),
});

const loadingExperienceSchema = z.looseObject({
  metrics: z.record(z.string(), metricSchema).optional(),
  overall_category: z.string().optional(),
  origin_fallback: z.boolean().optional(),
});

const auditSchema = z.looseObject({
  numericValue: z.number().optional(),
});

const categorySchema = z.looseObject({
  // Lighthouse reports null for a category it could not compute.
  score: z.number().nullish(),
});

const responseSchema = z.looseObject({
  lighthouseResult: z
    .looseObject({
      fetchTime: z.string().optional(),
      audits: z.record(z.string(), auditSchema).optional(),
      categories: z.record(z.string(), categorySchema).optional(),
    })
    .optional(),
  loadingExperience: loadingExperienceSchema.optional(),
});

/** Lighthouse audit ids for the lab metrics stored on a snapshot. */
const LAB_AUDIT_IDS = {
  lcpMs: "largest-contentful-paint",
  cls: "cumulative-layout-shift",
  tbtMs: "total-blocking-time",
  fcpMs: "first-contentful-paint",
  speedIndexMs: "speed-index",
  ttfbMs: "server-response-time",
} as const;

/** CrUX metric keys on loadingExperience.metrics. */
const FIELD_METRIC_KEYS = {
  lcp: "LARGEST_CONTENTFUL_PAINT_MS",
  inp: "INTERACTION_TO_NEXT_PAINT",
  cls: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
} as const;

function toScore(score: number | null | undefined): number | null {
  return typeof score === "number" ? Math.round(score * 100) : null;
}

function normalizeCategory(
  value: string | undefined,
): "FAST" | "AVERAGE" | "SLOW" | null {
  // CrUX also emits "NONE" when it has no verdict; treat it as no data.
  return value === "FAST" || value === "AVERAGE" || value === "SLOW"
    ? value
    : null;
}

/** Google's error envelope: { error: { message, errors: [{ reason }] } }. */
const errorBodySchema = z.looseObject({
  error: z
    .looseObject({
      message: z.string().optional(),
      errors: z
        .array(z.looseObject({ reason: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

function parseErrorBody(body: string): {
  reason: string | null;
  message: string | null;
} {
  try {
    const parsed = errorBodySchema.parse(JSON.parse(body));
    return {
      reason: parsed.error?.errors?.[0]?.reason ?? null,
      message: parsed.error?.message ?? null,
    };
  } catch {
    return { reason: null, message: null };
  }
}

export function messageForStatus(status: number, body: string): string {
  const { reason, message } = parseErrorBody(body);

  // 400 is overloaded. "Lighthouse could not load the page" and "your key is
  // bad" both arrive as 400; only `reason` separates them (verified live
  // 2026-07-29). Blaming the key for an unreachable page would send every
  // user off to regenerate a working credential.
  if (reason === "lighthouseUserError") {
    return (
      message?.slice(0, 400) ??
      "PageSpeed Insights could not load the page. Check the URL is publicly reachable."
    );
  }
  if (status === 400 || status === 403) {
    return "Google rejected the PageSpeed Insights API key (missing, invalid, or restricted). Update PAGESPEED_API_KEY to continue.";
  }
  if (status === 429) {
    return "PageSpeed Insights daily quota reached. Retry tomorrow, or raise the quota on the key's Google Cloud project.";
  }
  if (status === 404 || status === 500) {
    return `PageSpeed Insights could not analyze the URL (${status}). Check the page is publicly reachable.`;
  }
  return `PageSpeed Insights API error (${status}): ${body.slice(0, 300)}`;
}

/** Read-only PageSpeed Insights client. Auth is the instance-level
 *  PAGESPEED_API_KEY secret — there is no per-user grant. Response shape per
 *  the v5 reference; parsed leniently because Lighthouse adds audits between
 *  versions. See specs/0011. */
export function createPagespeedClient() {
  return {
    async runPagespeed(opts: {
      url: string;
      strategy: PagespeedStrategy;
    }): Promise<PagespeedResult> {
      const key = await getRequiredEnvValue("PAGESPEED_API_KEY");
      const params = new URLSearchParams({
        url: opts.url,
        strategy: opts.strategy,
        key,
      });
      // `category` is a repeated parameter, not a comma-separated list.
      for (const category of LIGHTHOUSE_CATEGORIES) {
        params.append("category", category);
      }

      const response = await fetch(`${PAGESPEED_API_URL}?${params}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new PagespeedApiError(
          response.status,
          messageForStatus(response.status, body),
          body,
        );
      }

      const parsed = responseSchema.parse(await response.json());
      const audits = parsed.lighthouseResult?.audits ?? {};
      const categories = parsed.lighthouseResult?.categories ?? {};
      const field = parsed.loadingExperience;
      const fieldMetrics = field?.metrics ?? {};

      const labMetric = (id: string): number | null =>
        audits[id]?.numericValue ?? null;
      const fieldPercentile = (metric: string): number | null =>
        fieldMetrics[metric]?.percentile ?? null;

      // CrUX reports CLS percentiles multiplied by 100 (5 => 0.05).
      const fieldClsPercentile = fieldPercentile(FIELD_METRIC_KEYS.cls);

      return {
        performanceScore: toScore(categories["performance"]?.score),
        accessibilityScore: toScore(categories["accessibility"]?.score),
        bestPracticesScore: toScore(categories["best-practices"]?.score),
        seoScore: toScore(categories["seo"]?.score),
        lcpMs: labMetric(LAB_AUDIT_IDS.lcpMs),
        cls: labMetric(LAB_AUDIT_IDS.cls),
        tbtMs: labMetric(LAB_AUDIT_IDS.tbtMs),
        fcpMs: labMetric(LAB_AUDIT_IDS.fcpMs),
        speedIndexMs: labMetric(LAB_AUDIT_IDS.speedIndexMs),
        ttfbMs: labMetric(LAB_AUDIT_IDS.ttfbMs),
        fieldLcpMs: fieldPercentile(FIELD_METRIC_KEYS.lcp),
        fieldInpMs: fieldPercentile(FIELD_METRIC_KEYS.inp),
        fieldCls: fieldClsPercentile === null ? null : fieldClsPercentile / 100,
        fieldOverallCategory: normalizeCategory(field?.overall_category),
        // Only meaningful when field data exists at all.
        fieldSource: field ? (field.origin_fallback ? "origin" : "url") : null,
        fetchTime: parsed.lighthouseResult?.fetchTime ?? null,
      };
    },
  };
}
