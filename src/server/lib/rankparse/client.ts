import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { ErrorCode } from "@/shared/error-codes";

const API_BASE = "https://api.rankparse.com/v1";
const MAX_RANKPARSE_ERROR_PAYLOAD_LENGTH = 1600;
// Safety ceiling on any live call. Matches dataforseo/core.ts's timeout —
// verified against the live API that R2 SQL queries against large domains
// (e.g. top-pages/backlinks on a domain with 10k+ referring domains) can take
// 15-20s, well past a tighter 30s budget under any added latency variance.
const RANKPARSE_REQUEST_TIMEOUT_MS = 60_000;
// Retry idempotent reads on transient 5xx. Total attempts = retries + 1.
const RANKPARSE_MAX_RETRIES = 2;
const RANKPARSE_RETRY_BACKOFF_MS = 250;

/** RankParse's lowest per-credit price tier (see rankparse-api/api/src/stripe.ts
 * PRICING_TIERS[0]). Used only to convert credits_used into a costUsd figure
 * for the existing Autumn metering pipeline in dataforseo/client.ts — RankParse
 * itself bills in credits, not USD. */
export const RANKPARSE_COST_PER_CREDIT_USD = 0.01;

type RankparseEnvelope<T> = {
  domain?: string;
  data: T;
  total?: number | null;
  limit?: number;
  offset?: number;
  credits_used: number;
  credits_remaining?: number;
  crawl_release?: string;
  cached?: boolean;
};

type RankparseErrorBody = {
  error?: string;
  code?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseErrorBody(rawText: string): RankparseErrorBody | null {
  try {
    const parsed: unknown = JSON.parse(rawText);
    return isRecord(parsed) ? (parsed as RankparseErrorBody) : null;
  } catch {
    return null;
  }
}

function formatErrorPayload(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  return text.length > MAX_RANKPARSE_ERROR_PAYLOAD_LENGTH
    ? `${text.slice(0, MAX_RANKPARSE_ERROR_PAYLOAD_LENGTH)}... [truncated]`
    : text;
}

/**
 * Maps a RankParse error response (`{error, code, message}` per
 * docs/api-reference.md) to a product AppError. `insufficient_credits` reuses
 * BACKLINKS_BILLING_ISSUE — the same code DataForSEO balance failures throw —
 * so BacklinksService's existing error handling covers both providers.
 */
function classifyRankparseError(
  status: number,
  body: RankparseErrorBody | null,
  path: string,
  rawBody: string,
): AppError {
  const message = body?.message ?? `RankParse HTTP ${status} on ${path}`;
  const details = {
    provider: "rankparse",
    providerStatus: String(status),
    providerPath: path,
    responseBody: formatErrorPayload(body ?? rawBody),
  };

  if (status === 402 || body?.code === "insufficient_credits") {
    return new AppError(
      "BACKLINKS_BILLING_ISSUE",
      "The connected RankParse account has run out of credits",
      details,
    );
  }
  if (status === 401 || body?.code === "invalid_api_key") {
    return new AppError("RANKPARSE_AUTH_FAILED", message, details);
  }
  if (status === 429 || body?.code === "rate_limited") {
    return new AppError("RATE_LIMITED", message, details);
  }
  if (status === 400) {
    return new AppError("VALIDATION_ERROR", message, details);
  }

  const code: ErrorCode =
    status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR";
  const error = new AppError(code, message, details);
  error.name = "RankParseHttpError";
  return error;
}

/**
 * GET against the RankParse REST API. Params with `undefined`/`null` values
 * are dropped. Throws AppError on any non-2xx response after retrying
 * idempotent 5xx failures, mirroring dataforseo/core.ts's authenticated-fetch
 * pattern.
 */
export async function rankparseGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
): Promise<RankparseEnvelope<T>> {
  const apiKey = await getOptionalEnvValue("RANKPARSE_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "RANKPARSE_AUTH_FAILED",
      "BACKLINKS_PROVIDER=rankparse is set but RANKPARSE_API_KEY is missing",
    );
  }

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const signal = AbortSignal.timeout(RANKPARSE_REQUEST_TIMEOUT_MS);

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal,
    });
    if (response.ok) {
      return await response.json();
    }

    if (response.status >= 500 && attempt < RANKPARSE_MAX_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, RANKPARSE_RETRY_BACKOFF_MS * (attempt + 1)),
      );
      continue;
    }

    const rawText = await response.text();
    const body = parseErrorBody(rawText);
    throw classifyRankparseError(response.status, body, url.pathname, rawText);
  }
}
