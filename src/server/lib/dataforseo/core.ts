import {
  AiOptimizationApi,
  AppendixApi,
  BacklinksApi,
  BusinessDataApi,
  DataforseoLabsApi,
  KeywordsDataApi,
  OnPageApi,
  SerpApi,
} from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { getDataforseoContext } from "@/server/lib/dataforseo/context";
import type { ErrorCode } from "@/shared/error-codes";
import { getSamTraceBus } from "@/server/features/sam/samTraceBus";
import {
  attachDataforseoDiagnostics,
  classifyTransportError,
  diagnosticsToTraceMetadata,
  extractSafeRequestMetadata,
  sanitizeDataforseoMessage,
  type DataforseoCallDiagnostics,
} from "@/server/lib/dataforseo/shared";
import {
  extractSafeDataforseoErrorMessage,
  formatDataforseoHttpErrorMessage,
} from "@/shared/dataforseoDiagnosticsParser";

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

/** "v3/a/b/c/live" from "/v3/a/b/c/live" (leading slash stripped for the trace). */
function dataforseoEndpointOf(url: RequestInfo): string | undefined {
  const path = formatDataforseoRequestPath(url);
  return (path.startsWith("/") ? path.slice(1) : path) || undefined;
}

/** "dataforseo_labs" (the API family) from "v3/dataforseo_labs/google/x/live". */
function dataforseoApiOf(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  const segments = endpoint.split("/");
  return segments[0] === "v3" && segments.length > 1 ? segments[1] : undefined;
}

type DataforseoAppStatus = {
  statusCode?: number;
  statusMessage?: string;
  tasksCount?: number;
  resultCount?: number;
  itemsCount?: number;
};

/** Runtime type guard: an unknown JSON value as a record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    record[key] = Reflect.get(value, key);
  }
  return record;
}

/** Safe shape counters read from the first task of a DataForSEO response. */
function taskShapeOf(task: Record<string, unknown>): Pick<DataforseoAppStatus, "statusCode" | "statusMessage" | "resultCount" | "itemsCount"> {
  const out: Pick<DataforseoAppStatus, "statusCode" | "statusMessage" | "resultCount" | "itemsCount"> = {};
  if (typeof task.status_code === "number") out.statusCode = task.status_code;
  if (typeof task.status_message === "string") out.statusMessage = task.status_message;
  if (typeof task.result_count === "number") out.resultCount = task.result_count;
  const results: unknown = Array.isArray(task.result) ? task.result[0] : undefined;
  const resultRecord = asRecord(results);
  if (resultRecord && Array.isArray(resultRecord.items)) {
    out.itemsCount = resultRecord.items.length;
  }
  return out;
}

/**
 * Safely read DataForSEO's application status fields from a CLONED response
 * body — never the raw body itself: status_code / status_message (they are
 * short plain-English strings like "Ok." / "Payment Required.") plus, for
 * successful responses only, safe shape counters (tasks / results / items).
 * Any parse failure returns empty rather than surfacing raw text.
 */
async function readDataforseoAppStatus(
  cloned: Response,
): Promise<DataforseoAppStatus> {
  try {
    const text = await cloned.text();
    if (text === "") return {};
    const parsed: unknown = JSON.parse(text);
    const record = asRecord(parsed);
    if (!record) return {};
    const out: DataforseoAppStatus = {};
    if (typeof record.status_code === "number") out.statusCode = record.status_code;
    if (typeof record.status_message === "string") out.statusMessage = record.status_message;
    if (typeof record.tasks_count === "number") out.tasksCount = record.tasks_count;
    if (typeof record.result_count === "number") out.resultCount = record.result_count;
    if (Array.isArray(record.tasks)) {
      const shape = taskShapeOf(asRecord(record.tasks[0]) ?? {});
      // The first task's status is authoritative for the call outcome (e.g.
      // HTTP 402 with a 40200 "Payment Required." task); the envelope's
      // top-level "Ok." only describes the transport layer.
      if (shape.statusCode !== undefined) out.statusCode = shape.statusCode;
      if (shape.statusMessage !== undefined) out.statusMessage = shape.statusMessage;
      out.resultCount ??= shape.resultCount;
      out.itemsCount ??= shape.itemsCount;
    }
    return out;
  } catch {
    return {};
  }
}

async function resolveAuthenticatedDataforseoBasicAuth(): Promise<string> {
  const context = getDataforseoContext();
  if (context?.login && context?.password) {
    return Buffer.from(`${context.login}:${context.password}`).toString("base64");
  }

  // Check legacy environment API key or login/password first
  try {
    const rawKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
    if (rawKey?.trim()) {
      return rawKey.trim();
    }
  } catch {
    // Not configured via DATAFORSEO_API_KEY
  }

  const envLogin = process.env.DATAFORSEO_LOGIN;
  const envPassword = process.env.DATAFORSEO_PASSWORD;
  if (envLogin?.trim() && envPassword?.trim()) {
    return Buffer.from(`${envLogin.trim()}:${envPassword.trim()}`).toString("base64");
  }

  // Dynamic fallback: resolve effective settings from DB if not in context
  try {
    const { resolveEffectiveDataforseoConfig } = await import(
      "@/server/features/settings/services/DataforseoSettingsService"
    );
    const effective = await resolveEffectiveDataforseoConfig({
      organizationId: context?.organizationId,
      projectId: context?.projectId,
    });
    if (effective.login && effective.password) {
      return Buffer.from(`${effective.login}:${effective.password}`).toString("base64");
    }
  } catch {
    // If DB is unavailable in pure endpoint unit test environments, fall through to error
  }

  throw new AppError(
    "DATAFORSEO_AUTH_FAILED",
    "DataForSEO credentials are not configured. Configure them in Settings or set environment credentials.",
  );
}

/** Parse JSON without throwing (used only to extract safe request metadata). */
function safeParseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    // DataForSEO bodies are arrays of task objects; take the first task.
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return undefined;
  }
}

/**
 * Wrap a raw network exception in an Error when it isn't already one (e.g. a
 * plain string throw), preserving the original message so the transport
 * classifier and logs see the real runtime failure.
 */
function wrapTransportError(error: unknown): Error {
  if (error instanceof Error) return error;
  const wrapped = new Error(
    typeof error === "string" ? error : "DataForSEO network request failed",
  );
  const record = asRecord(error);
  if (record) {
    Object.assign(wrapped, record);
  }
  return wrapped;
}

/**
 * Push a dataforseo provider trace event carrying the full sanitized
 * diagnostics record. The bus no-ops outside a SAM turn, so this is strictly
 * observational and can never change request behavior. samTraceBus is an eager
 * module (no dataforseo imports), so this static import keeps the lazy SDK
 * boundary intact.
 */
function emitDataforseoTrace(
  event: "provider_error" | "provider_success",
  diagnostics: DataforseoCallDiagnostics,
): void {
  try {
    const bus = getSamTraceBus();
    if (!bus.currentTurnId()) return;
    bus.push({
      event,
      provider: "dataforseo",
      // No explicit attempt: the ambient trace scope (runWithTraceScope in the
      // guarded runner) attributes the event to the current tool + attempt.
      httpStatus:
        typeof diagnostics.httpStatus === "number"
          ? diagnostics.httpStatus
          : undefined,
      metadata: diagnosticsToTraceMetadata(diagnostics),
    });
  } catch {
    // Trace emission must never fail the actual request.
  }
}

/**
 * The single authenticated `fetch` used by every DataForSEO SDK call. Throws on
 * non-2xx so the SDK's own `ApiException` path never fires; task-level failures
 * (which return HTTP 200) are handled downstream by {@link assertOk}. An
 * optional classifier maps recognised HTTP failures to product errors.
 *
 * DIAGNOSTICS: every failure leaves this seam carrying a sanitized
 * `dataforseoDiagnostics` record — endpoint, HTTP status (or null when no
 * response arrived), the transport category classified from the actual
 * runtime exception (DNS / timeout / connection / TLS), DataForSEO's
 * application status_code / status_message, and safe request metadata
 * (target / location / language) — so the SAM Debug Trace shows the exact
 * low-level cause instead of a collapsed TRANSIENT_UPSTREAM label. No
 * credentials, no headers, no raw bodies ever leave this seam.
 */
function createAuthenticatedFetch(classify?: DataforseoErrorClassifier) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const basicAuth = await resolveAuthenticatedDataforseoBasicAuth();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${basicAuth}`);
    // Resolve the signal once so retries share the overall request timeout
    // rather than restarting a fresh 60s budget on each attempt.
    const signal =
      init?.signal ?? AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS);

    const endpoint = dataforseoEndpointOf(url);
    const api = dataforseoApiOf(endpoint);
    const requestMeta = extractSafeRequestMetadata(
      typeof init?.body === "string" ? safeParseJson(init.body) : undefined,
    );
    const baseDiagnostics = (): DataforseoCallDiagnostics => ({
      endpoint,
      api,
      ...(requestMeta ? { request: requestMeta } : {}),
    });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, { ...init, headers, signal });
      } catch (error) {
        // No HTTP response was received — a transport-level failure. Classify
        // it from the actual runtime exception (never guess), attach the
        // record, emit the trace event, and rethrow.
        const transportError = classifyTransportError(error);
        const wrapped = wrapTransportError(error);
        const diagnostics = baseDiagnostics();
        diagnostics.httpStatus = null;
        diagnostics.transportError = transportError;
        attachDataforseoDiagnostics(wrapped, diagnostics);
        emitDataforseoTrace("provider_error", diagnostics);
        console.warn(
          `dataforseo.transport-failure endpoint=${endpoint ?? "unknown"} transport=${transportError} attempt=${attempt + 1}`,
        );
        throw wrapped;
      }

      // Clone before anyone reads the body: the SDK consumes the original, the
      // diagnostics read the clone (status fields + success-only shape counts).
      const cloned = response.clone();

      if (response.ok) {
        // Fire-and-forget success diagnostics with the safe response shape.
        void readDataforseoAppStatus(cloned)
          .then((shape) => {
            const diagnostics = baseDiagnostics();
            diagnostics.httpStatus = response.status;
            diagnostics.dataforseoStatus = shape.statusCode ?? null;
            diagnostics.dataforseoMessage =
              sanitizeDataforseoMessage(shape.statusMessage);
            if (
              shape.tasksCount !== undefined ||
              shape.resultCount !== undefined ||
              shape.itemsCount !== undefined
            ) {
              diagnostics.responseShape = {
                tasks: shape.tasksCount,
                results: shape.resultCount,
                items: shape.itemsCount,
              };
            }
            emitDataforseoTrace("provider_success", diagnostics);
          })
          .catch(() => {
            // Diagnostics must never break the actual request flow.
          });
        return response;
      }

      // Transient upstream 5xx on an idempotent read -> back off and retry.
      if (response.status >= 500 && attempt < DATAFORSEO_MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, DATAFORSEO_RETRY_BACKOFF_MS * (attempt + 1)),
        );
        continue;
      }

      const rawText = await response.text();
      const path = formatDataforseoRequestPath(url);
      const appStatus = await readDataforseoAppStatus(cloned);
      const safeInfo = extractSafeDataforseoErrorMessage(
        response.status,
        rawText,
        appStatus,
      );
      const diagnostics = baseDiagnostics();
      diagnostics.httpStatus = response.status;
      diagnostics.dataforseoStatus = safeInfo.statusCode;
      diagnostics.dataforseoMessage = safeInfo.statusMessage;
      emitDataforseoTrace("provider_error", diagnostics);

      const classified = classify?.(response.status, rawText, path);
      if (classified) {
        attachDataforseoDiagnostics(classified, diagnostics);
        throw classified;
      }

      const code: ErrorCode =
        response.status >= 500
          ? "UPSTREAM_UNAVAILABLE"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401
              ? "DATAFORSEO_AUTH_FAILED"
              : response.status === 402
                ? "PAYMENT_REQUIRED"
                : "INTERNAL_ERROR";
      const formattedMessage = formatDataforseoHttpErrorMessage(
        response.status,
        path,
        safeInfo.statusMessage,
        safeInfo.statusCode,
      );
      const error = new AppError(
        code,
        formattedMessage,
        {
          provider: "dataforseo",
          providerStatus: String(response.status),
          providerPath: path,
          responseBody: formatDataforseoErrorPayload(rawText),
        },
      );
      error.name = "DataForSEOHttpError";
      attachDataforseoDiagnostics(error, diagnostics);
      throw error;
    }
  };
}

function http(classify?: DataforseoErrorClassifier) {
  return { fetch: createAuthenticatedFetch(classify) };
}

// Per-section API factories. Each is created per-request so the auth secret is
// read lazily (it lives in the Worker env, not in module scope).
export const labsApi = () => new DataforseoLabsApi(API_BASE, http());
export const keywordsDataApi = () => new KeywordsDataApi(API_BASE, http());
export const serpApi = () => new SerpApi(API_BASE, http());
export const businessDataApi = () => new BusinessDataApi(API_BASE, http());
export const onPageApi = () => new OnPageApi(API_BASE, http());
// Account/appendix data (spend, balance, rates). userData() is FREE ($0) and
// read-only — do NOT wire it through metering.
export const appendixApi = () => new AppendixApi(API_BASE, http());
export const backlinksApi = (classify?: DataforseoErrorClassifier) =>
  new BacklinksApi(API_BASE, http(classify));
export const aiOptimizationApi = (classify?: DataforseoErrorClassifier) =>
  new AiOptimizationApi(API_BASE, http(classify));
