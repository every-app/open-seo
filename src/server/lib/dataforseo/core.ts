import {
  AiOptimizationApi,
  BacklinksApi,
  BusinessDataApi,
  DataforseoLabsApi,
  OnPageApi,
  SerpApi,
} from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

const API_BASE = "https://api.dataforseo.com";
const MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH = 1600;
// Safety ceiling on any live call (Lighthouse is the slowest, ~tens of seconds).
const DATAFORSEO_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Translates a DataForSEO HTTP/task failure into a product-specific AppError
 * (e.g. "backlinks not enabled", "billing issue"). Returns null when the
 * failure isn't one this classifier recognises, so the caller can fall back to
 * a generic error. See {@link createDataforseoAccessClassifier}.
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
 * The single authenticated `fetch` used by every DataForSEO SDK call. Throws on
 * non-2xx so the SDK's own `ApiException` path never fires; task-level failures
 * (which return HTTP 200) are handled downstream by {@link assertOk}. An
 * optional classifier maps recognised HTTP failures to product errors.
 */
function createAuthenticatedFetch(classify?: DataforseoErrorClassifier) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);

    const response = await fetch(url, {
      ...init,
      headers,
      signal:
        init?.signal ?? AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return response;

    const rawText = await response.text();
    const path = formatDataforseoRequestPath(url);
    const classified = classify?.(response.status, rawText, path);
    if (classified) throw classified;

    const error = new AppError(
      response.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
      `DataForSEO HTTP ${response.status} on ${path}`,
      {
        provider: "dataforseo",
        providerStatus: String(response.status),
        providerPath: path,
        responseBody: formatDataforseoErrorPayload(rawText),
      },
    );
    error.name = "DataForSEOHttpError";
    throw error;
  };
}

function http(classify?: DataforseoErrorClassifier) {
  return { fetch: createAuthenticatedFetch(classify) };
}

// Per-section API factories. Each is created per-request so the auth secret is
// read lazily (it lives in the Worker env, not in module scope).
export const labsApi = () => new DataforseoLabsApi(API_BASE, http());
export const serpApi = () => new SerpApi(API_BASE, http());
export const businessDataApi = () => new BusinessDataApi(API_BASE, http());
export const onPageApi = () => new OnPageApi(API_BASE, http());
export const backlinksApi = (classify?: DataforseoErrorClassifier) =>
  new BacklinksApi(API_BASE, http(classify));
export const aiOptimizationApi = (classify?: DataforseoErrorClassifier) =>
  new AiOptimizationApi(API_BASE, http(classify));
