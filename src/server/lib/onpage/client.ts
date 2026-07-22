import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { OnPageConnectionRepository } from "@/server/features/content-optimization/repositories/OnPageConnectionRepository";

/**
 * Minimal client for the On-Page.ai REST API (https://api.on-page.ai).
 * Scans are asynchronous: create a job, poll its status, then fetch the
 * customer-safe report. Auth is a bearer API key supplied by the operator
 * via ONPAGE_API_KEY, mirroring the BYO DATAFORSEO_API_KEY pattern; the
 * integration stays dormant when the key is absent.
 */
const API_BASE = "https://api.on-page.ai";
const REQUEST_TIMEOUT_MS = 30_000;

export class OnPageApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OnPageApiError";
  }
}

/** Env var wins (operator-controlled, DataForSEO-style); the guided
 * connect flow's stored key is the fallback. */
async function getOnPageApiKey(): Promise<string | null> {
  const envKey = await getOptionalEnvValue("ONPAGE_API_KEY");
  if (envKey) return envKey;
  return OnPageConnectionRepository.getApiKey();
}

export async function isOnPageConfigured(): Promise<boolean> {
  return (await getOnPageApiKey()) !== null;
}

async function apiBase(): Promise<string> {
  const override = await getOptionalEnvValue("ONPAGE_API_BASE");
  return (override ?? API_BASE).replace(/\/+$/, "");
}

const scanJobCreatedSchema = z.object({
  job_id: z.string(),
  status: z.string().optional(),
});

const jobStatusSchema = z.object({
  job_id: z.string(),
  status: z.enum([
    "queued",
    "waiting",
    "running",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ]),
  progress: z.number().nullish(),
  error: z
    .object({ code: z.string().nullish(), message: z.string().nullish() })
    .nullish(),
});

const coverageStatusSchema = z.enum(["good", "present_not_entity", "missing"]);

const coverageEntrySchema = z.object({
  entity: z.string(),
  importance: z.number().optional(),
  coverage_status: coverageStatusSchema,
});

const keywordVariationSchema = z.object({
  variation: z.string(),
  coverage_status: coverageStatusSchema,
});

const benchmarkMetricsSchema = z.object({
  word_count: z.number().nullable(),
  h1_count: z.number().nullable(),
  h2_count: z.number().nullable(),
  h3_count: z.number().nullable(),
  image_count: z.number().nullable(),
  entity_count: z.number().nullable(),
  keyword_variation_count: z.number().nullable(),
});

/**
 * The sections of the customer report the integration renders. The wire
 * report (schema_version onpage-report-customer-v1) is richer; unknown
 * fields are stripped so the result stays serializable across the server
 * function boundary.
 */
export const onPageReportSchema = z.object({
  meta: z.object({
    report_date: z.string().nullable(),
    target_keyword: z.string().nullable(),
    location: z.string().nullable(),
    url: z.string().nullable(),
  }),
  on_page_optimization: z.object({
    score: z.number().nullable(),
    grade: z.string(),
    summary: z.string(),
    focus_areas: z.array(z.string()),
  }),
  benchmarks: z.object({
    page1_average: benchmarkMetricsSchema,
    your_url: benchmarkMetricsSchema,
  }),
  entity_coverage: z.object({
    your_url_related_entity_density_score: z.number().nullable(),
    competitor_related_entity_density_score: z.number().nullable(),
    natural_language_entities: z.array(coverageEntrySchema),
    highly_related_terms: z.array(coverageEntrySchema),
    keyword_variations: z.array(keywordVariationSchema),
  }),
  topic_and_classification: z.object({
    page_classification: z
      .array(
        z.object({
          rank: z.number(),
          category: z.string(),
          url: z.string().nullable(),
          confidence: z.number().nullable(),
        }),
      )
      .default([]),
    // The scanned page's own category. Defaults to null for reports stored
    // before the API exposed it.
    your_page: z
      .object({ category: z.string(), confidence: z.number().nullable() })
      .nullable()
      .default(null),
    swipe_content: z.object({
      suggested_title: z.string().nullable(),
      topic_coverage: z.array(z.string()),
    }),
    topical_authority_questions: z.record(z.string(), z.array(z.string())),
  }),
  internal_linking: z.object({
    add_internal_links_from: z.array(z.string()),
    to_your_url: z.string().nullable(),
  }),
  competitor_term_coverage: z.object({
    domains: z.array(z.string()),
    terms: z.array(
      z.object({
        keyword: z.string(),
        importance: z.number(),
        your_url_count: z.number(),
        competitor_counts: z.array(z.number()),
      }),
    ),
  }),
  jobId: z.string().optional(),
  jobDisplayId: z.string().optional(),
  poweredBy: z.string().optional(),
});

export type OnPageReport = z.infer<typeof onPageReportSchema>;

const verifySchema = z.object({
  poweredBy: z.string().optional(),
  credits: z.unknown().optional(),
});

async function onPageFetch(path: string, init?: RequestInit) {
  const apiKey = await getOnPageApiKey();
  if (apiKey === null) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "On-Page.ai is not connected. Connect your account or set ONPAGE_API_KEY.",
    );
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${await apiBase()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response;
}

// ─── Guided connect (device-connect handshake, no auth required) ─────────────

const connectSessionSchema = z.object({
  code: z.string(),
  poll_secret: z.string(),
  activate_url: z.string(),
  expires_in_s: z.number(),
  poll_interval_s: z.number(),
});

type OnPageConnectSession = z.infer<typeof connectSessionSchema>;

export async function createOnPageConnectSession(): Promise<OnPageConnectSession> {
  // ONPAGE_CONNECT_SOURCE exists for staging/self-test setups; the shipped
  // default is the registered "openseo" source.
  const source =
    (await getOptionalEnvValue("ONPAGE_CONNECT_SOURCE")) ?? "openseo";
  const response = await fetch(`${await apiBase()}/v1/connect/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, device_name: "OpenSEO" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const parsed = connectSessionSchema.safeParse(
    await readJsonOrThrow(response),
  );
  if (!parsed.success) {
    throw new OnPageApiError(
      502,
      "On-Page.ai returned an unexpected connect response.",
    );
  }
  return parsed.data;
}

const connectPollSchema = z.object({
  status: z.enum(["pending", "approved", "expired"]),
  api_key: z.string().optional(),
});

export async function pollOnPageConnectSession(input: {
  code: string;
  pollSecret: string;
}): Promise<{ status: "pending" | "approved" | "expired"; apiKey?: string }> {
  const response = await fetch(`${await apiBase()}/v1/connect/sessions/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: input.code, poll_secret: input.pollSecret }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const parsed = connectPollSchema.safeParse(await readJsonOrThrow(response));
  if (!parsed.success) {
    throw new OnPageApiError(
      502,
      "On-Page.ai returned an unexpected poll response.",
    );
  }
  return { status: parsed.data.status, apiKey: parsed.data.api_key };
}

function messageForStatus(status: number): string {
  if (status === 401) {
    return "On-Page.ai rejected the API key. Check ONPAGE_API_KEY and restart.";
  }
  if (status === 402) {
    return "The On-Page.ai account is out of scan credits. Top up or upgrade at api.on-page.ai, then retry.";
  }
  if (status === 429) {
    return "On-Page.ai rate limit reached. Wait a moment and retry.";
  }
  return `On-Page.ai request failed with status ${status}.`;
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new OnPageApiError(
      response.status,
      messageForStatus(response.status),
    );
  }
  return response.json();
}

export async function createContentScan(input: {
  url: string;
  keyword: string;
  region?: string;
}): Promise<{ jobId: string }> {
  const response = await onPageFetch("/v1/scan", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      keyword: input.keyword,
      ...(input.region ? { region: input.region } : {}),
    }),
  });
  const parsed = scanJobCreatedSchema.safeParse(
    await readJsonOrThrow(response),
  );
  if (!parsed.success) {
    throw new OnPageApiError(
      502,
      "On-Page.ai returned an unexpected scan response.",
    );
  }
  return { jobId: parsed.data.job_id };
}

type ContentScanStatus = z.infer<typeof jobStatusSchema>;

export async function getContentScanJob(
  jobId: string,
): Promise<ContentScanStatus> {
  const response = await onPageFetch(`/v1/jobs/${encodeURIComponent(jobId)}`);
  const parsed = jobStatusSchema.safeParse(await readJsonOrThrow(response));
  if (!parsed.success) {
    throw new OnPageApiError(
      502,
      "On-Page.ai returned an unexpected job status.",
    );
  }
  return parsed.data;
}

export async function getContentScanReport(
  jobId: string,
): Promise<OnPageReport> {
  const response = await onPageFetch(
    `/v1/jobs/${encodeURIComponent(jobId)}/result`,
  );
  // 409 = completed job's result not materialized yet; poll status first.
  if (response.status === 409) {
    throw new OnPageApiError(409, "The scan result is not available yet.");
  }
  const parsed = onPageReportSchema.safeParse(await readJsonOrThrow(response));
  if (!parsed.success) {
    throw new OnPageApiError(
      502,
      "On-Page.ai returned an unexpected report shape.",
    );
  }
  return parsed.data;
}

export async function verifyOnPageConnection(): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    const response = await onPageFetch("/v1/verify");
    if (!response.ok) {
      return { ok: false, message: messageForStatus(response.status) };
    }
    const parsed = verifySchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true }
      : {
          ok: false,
          message: "On-Page.ai returned an unexpected verify response.",
        };
  } catch (error) {
    if (error instanceof AppError) throw error;
    return {
      ok: false,
      message: "Could not reach On-Page.ai. Check connectivity and retry.",
    };
  }
}
