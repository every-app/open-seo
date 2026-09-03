import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { ErrorCode } from "@/shared/error-codes";
// Type-only: erased at compile, so no runtime cycle with envelope.ts (which
// imports DataforseoErrorClassifier from here the same way).
import type {
  DataforseoResponseLike,
  DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

const API_BASE = "https://api.dataforseo.com";
const MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH = 1600;
// Safety ceiling on any live call (Lighthouse is the slowest, ~tens of seconds).
const DATAFORSEO_REQUEST_TIMEOUT_MS = 60_000;
// Retry idempotent reads on transient 5xx. Total attempts = retries + 1; the
// shared request-timeout signal still caps overall wall time.
const DATAFORSEO_MAX_RETRIES = 2;
const DATAFORSEO_RETRY_BACKOFF_MS = 250;

/**
 * Translates a DataForSEO HTTP/task failure into a product-specific AppError
 * (e.g. "billing issue"). Returns null when the failure isn't one this
 * classifier recognises, so the caller can fall back to a generic error. See
 * {@link createDataforseoBillingClassifier}.
 */
export type DataforseoErrorClassifier = (
  status: number | undefined,
  details: string,
  path: string,
) => AppError | null;

function formatDataforseoErrorPayload(value: unknown): string {
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

  return text.length > MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH
    ? `${text.slice(0, MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH)}... [truncated]`
    : text;
}

function formatDataforseoRequestPath(url: RequestInfo): string {
  const rawUrl = typeof url === "string" ? url : url.url;
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * The single authenticated `fetch` used by every DataForSEO call. Throws on
 * non-2xx; task-level failures (which return HTTP 200) are handled downstream
 * by {@link assertOk}. An optional classifier maps recognised HTTP failures to
 * product errors.
 */
function createAuthenticatedFetch(
  classify?: DataforseoErrorClassifier,
  maxServerErrorRetries = DATAFORSEO_MAX_RETRIES,
) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);
    // Resolve the signal once so retries share the overall request timeout
    // rather than restarting a fresh 60s budget on each attempt.
    const signal =
      init?.signal ?? AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS);

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, { ...init, headers, signal });
      } catch (error) {
        // Both abort flavours mean "we ran out of time", and neither carries a
        // useful name of its own: the shared budget above rejects with
        // TimeoutError, while Lighthouse passes its own AbortController
        // deadline via init.signal and rejects with AbortError. Classify them
        // so callers get a provider-degradation error instead of an anonymous
        // internal one. Deliberately not retried: a call that ran past the
        // deadline may already be billed by DataForSEO, and because this is not
        // a DataforseoChargedTaskError the customer is metered nothing for it,
        // so replaying would be spend we eat twice.
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          const path = formatDataforseoRequestPath(url);
          const timeoutError = new AppError(
            "UPSTREAM_UNAVAILABLE",
            `DataForSEO request timed out on ${path}`,
            { provider: "dataforseo", providerPath: path },
          );
          timeoutError.name = "DataForSEOTimeoutError";
          throw timeoutError;
        }
        throw error;
      }
      if (response.ok) return response;

      // Transient upstream 5xx on an idempotent read -> back off and retry.
      if (response.status >= 500 && attempt < maxServerErrorRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, DATAFORSEO_RETRY_BACKOFF_MS * (attempt + 1)),
        );
        continue;
      }

      const rawText = await response.text();
      const path = formatDataforseoRequestPath(url);
      const classified = classify?.(response.status, rawText, path);
      if (classified) throw classified;

      const code: ErrorCode =
        response.status >= 500
          ? "UPSTREAM_UNAVAILABLE"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401
              ? "DATAFORSEO_AUTH_FAILED"
              : "INTERNAL_ERROR";
      const error = new AppError(
        code,
        `DataForSEO HTTP ${response.status} on ${path}`,
        {
          provider: "dataforseo",
          providerStatus: String(response.status),
          providerPath: path,
          responseBody: formatDataforseoErrorPayload(rawText),
        },
      );
      error.name = "DataForSEOHttpError";
      // UPSTREAM_UNAVAILABLE is non-reportable, and the error handlers only log
      // what they capture, so warn here to keep the provider's failure rate
      // visible in Workers Observability. Warn, not error: there is nothing in
      // the app to fix.
      if (code === "UPSTREAM_UNAVAILABLE")
        console.warn("dataforseo.upstream-http-failed", {
          path,
          status: response.status,
        });
      throw error;
    }
  };
}

type DataforseoRequestOptions = {
  /** Maps a recognised access / billing HTTP failure to a product error. */
  classify?: DataforseoErrorClassifier;
  /**
   * Set 0 for billed, non-idempotent calls (business task_post, Lighthouse):
   * a 5xx does not prove the provider skipped the charge, so those must never
   * be replayed. Defaults to retrying idempotent reads on transient 5xx.
   */
  maxServerErrorRetries?: number;
};

async function requestDataforseo<TTask extends DataforseoTaskLike>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: DataforseoRequestOptions,
): Promise<DataforseoResponseLike<TTask> | null> {
  const doFetch = createAuthenticatedFetch(
    options.classify,
    options.maxServerErrorRetries,
  );
  const response = await doFetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (text === "") return null;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the task type is the caller's claim about the payload; billing metadata and item fields are validated downstream (envelope.ts + section Zod schemas)
  return JSON.parse(text) as DataforseoResponseLike<TTask>;
}

/**
 * POST `tasks` (the standard array-of-task-payloads body) to a DataForSEO
 * endpoint and return the parsed response envelope. The task type parameter is
 * the caller's claim about the payload shape — fields we act on are validated
 * downstream (billing metadata in envelope.ts, items via the section fetchers'
 * Zod schemas). Auth is read per-call from the Worker env.
 */
export function dataforseoPost<
  TTask extends DataforseoTaskLike = DataforseoTaskLike,
>(
  path: string,
  tasks: unknown[],
  options: DataforseoRequestOptions = {},
): Promise<DataforseoResponseLike<TTask> | null> {
  return requestDataforseo("POST", path, tasks, options);
}

/**
 * POST like {@link dataforseoPost} but return the UN-CONSUMED Response
 * (headers only) — the same auth, retry policy, and HTTP-error ladder apply.
 * For the one endpoint whose body is too big to read eagerly: Lighthouse
 * gates its multi-MB body reads behind a parse lock in the audit worker, and
 * passes its own `signal` so the timeout can be cleared once headers arrive.
 */
export function dataforseoPostResponse(
  path: string,
  tasks: unknown[],
  options: DataforseoRequestOptions & { signal?: AbortSignal } = {},
): Promise<Response> {
  const doFetch = createAuthenticatedFetch(
    options.classify,
    options.maxServerErrorRetries,
  );
  return doFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(tasks),
    signal: options.signal,
  });
}

/** GET a DataForSEO endpoint (task_get collection, appendix/locations data). */
export function dataforseoGet<
  TTask extends DataforseoTaskLike = DataforseoTaskLike,
>(
  path: string,
  options: DataforseoRequestOptions = {},
): Promise<DataforseoResponseLike<TTask> | null> {
  return requestDataforseo("GET", path, undefined, options);
}
