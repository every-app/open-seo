// SDK-free constants and target builders shared between eager server code
// (features, workflows, MCP tools) and the lazily loaded section fetchers.
// Keep this module free of dataforseo-client and section-file imports —
// anything imported from here must be safe to evaluate in the eager isolate
// startup graph.

// ChatGPT mention/response data is only available for US/en per DataForSEO docs.
export const CHATGPT_LOCATION_CODE = 2840;
export const CHATGPT_LANGUAGE_CODE = "en";

export type LlmPlatform = "chat_gpt" | "google";

/** Max tasks DataForSEO accepts in a single task_post request. */
export const MAX_TASKS_PER_POST = 100;

// DataForSEO's LLM-mentions `target` array accepts domain OR keyword entries.
// We always pass exactly one target per call.
export type LlmTarget =
  | {
      domain: string;
      include_subdomains?: boolean;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
    }
  | {
      keyword: string;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
      match_type?: "word_match" | "partial_match";
    };

export function buildLlmTarget(input: {
  type: "domain" | "keyword";
  value: string;
}): LlmTarget {
  if (input.type === "domain") {
    return {
      domain: input.value,
      include_subdomains: true,
      search_filter: "include",
      search_scope: ["any"],
    };
  }
  return {
    keyword: input.value,
    search_filter: "include",
    search_scope: ["any", "brand_entities"],
    match_type: "word_match",
  };
}

// ---------------------------------------------------------------------------
// DataForSEO call diagnostics — sanitized, SDK-free runtime metadata that
// answers "WHY did this DataForSEO call fail?" at the transport, HTTP, and
// application layers. The vocabulary lives here so the DataForSEO core fetch,
// the billing classifiers, the SAM trace bus, and the client Debug Trace
// panel can all speak it without pulling dataforseo-client into an eager
// module graph. SECURITY INVARIANT: never credentials, headers, or raw bodies.
// ---------------------------------------------------------------------------

import { scrubTraceText } from "@/shared/samToolTraceTypes";
import type { SamToolTraceEvent } from "@/shared/samToolTraceTypes";

/** Coarse transport-failure category derived from the actual thrown error. */
export type DataforseoTransportError =
  | "DNS_LOOKUP_FAILED"
  | "TIMEOUT"
  | "CONNECTION_FAILED"
  | "TLS_FAILED"
  | "UNKNOWN_TRANSPORT";

/**
 * The full sanitized diagnostic record for one DataForSEO execution attempt.
 * Every field is optional — a layer that wasn't reached simply isn't present,
 * so consumers render `N/A` rather than guessing.
 */
export type DataforseoCallDiagnostics = {
  /** Request path, e.g. "v3/dataforseo_labs/google/domain_rank_overview/live". */
  endpoint?: string;
  /** DataForSEO API section family, e.g. "dataforseo_labs". */
  api?: string;
  /** HTTP status when a response arrived; null when it did not. */
  httpStatus?: number | null;
  /** Transport category when NO HTTP response arrived (network exception). */
  transportError?: DataforseoTransportError;
  /** DataForSEO application status_code from the response body (20000 = ok). */
  dataforseoStatus?: number | null;
  /** Sanitized DataForSEO application status_message. */
  dataforseoMessage?: string;
  /** Safe request metadata that helps diagnose parameter mistakes. */
  request?: {
    target?: string;
    locationCode?: number;
    locationName?: string;
    languageCode?: string;
    languageName?: string;
  };
  /**
   * Success-only response shape: tasks / results / items counts. Never
   * populated on failures — failures carry status fields instead.
   */
  responseShape?: {
    tasks?: number;
    results?: number;
    items?: number;
  };
};

const TRANSPORT_PATTERNS: Array<{
  pattern: RegExp;
  category: DataforseoTransportError;
}> = [
  // DNS resolution: ENOTFOUND / getaddrinfo / name-resolution failures.
  { pattern: /ENOTFOUND|getaddrinfo|EAI_AGAIN|dns|name or service not known/i, category: "DNS_LOOKUP_FAILED" },
  // Timeouts: fetch aborts, socket timeouts, sim timeouts.
  { pattern: /ETIMEDOUT|ETIMEOUT|timed?\s?out|abort|deadline/i, category: "TIMEOUT" },
  // TLS: certificate / SSL failures before any HTTP bytes arrived.
  { pattern: /CERT|SSL|TLS|certificate/i, category: "TLS_FAILED" },
  // Connection-level failures: refused / reset / dropped.
  { pattern: /ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|socket hang up|other side closed|fetch failed|connection/i, category: "CONNECTION_FAILED" },
];

/**
 * Classify a raw transport exception into a coarse category from the actual
 * runtime error — never a guess about the provider's health, only about the
 * local network failure mode. Tests drive every category deterministically.
 */
export function classifyTransportError(
  error: unknown,
): DataforseoTransportError {
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message}${error.cause instanceof Error ? ` ${error.cause.message}` : ""}`
        : "";
  if (text === "") return "UNKNOWN_TRANSPORT";
  for (const { pattern, category } of TRANSPORT_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "UNKNOWN_TRANSPORT";
}

/** Upper bound for a sanitized status_message (they are short, but be safe). */
const MAX_SANITIZED_MESSAGE_LENGTH = 300;

/**
 * Sanitize a DataForSEO status_message for trace/log display: length-bounded
 * and scrubbed of credential-shaped substrings. DataForSEO messages are plain
 * English ("Ok.", "Payment Required.", "Invalid Field: 'target'.") but the
 * scrub is a defense-in-depth invariant for anything unexpected.
 */
export function sanitizeDataforseoMessage(
  message: string | undefined,
): string | undefined {
  if (typeof message !== "string" || message === "") return undefined;
  const bounded =
    message.length > MAX_SANITIZED_MESSAGE_LENGTH
      ? `${message.slice(0, MAX_SANITIZED_MESSAGE_LENGTH)}…`
      : message;
  return scrubTraceText(bounded);
}

/**
 * Duck-typed accessor for diagnostics attached to a thrown DataForSEO error.
 * The attachment is a plain property so it survives the provider/router
 * rethrow chain without instanceof coupling across chunk boundaries.
 */
const DIAGNOSTICS_KEY = "dataforseoDiagnostics";

export function attachDataforseoDiagnostics<T extends object>(
  error: T,
  diagnostics: DataforseoCallDiagnostics,
): T {
  Object.assign(error, { [DIAGNOSTICS_KEY]: diagnostics });
  return error;
}

/** Read diagnostics off a thrown error, if the DataForSEO layer attached any. */
export function readDataforseoDiagnostics(
  error: unknown,
): DataforseoCallDiagnostics | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate: unknown = Reflect.get(error, DIAGNOSTICS_KEY);
  return isDataforseoDiagnostics(candidate) ? candidate : undefined;
}

/** Runtime type guard narrowing an unknown value into a diagnostics record. */
function isDataforseoDiagnostics(
  value: unknown,
): value is DataforseoCallDiagnostics {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "endpoint") === "string" ||
    typeof Reflect.get(value, "httpStatus") === "number" ||
    typeof Reflect.get(value, "transportError") === "string" ||
    typeof Reflect.get(value, "dataforseoStatus") === "number"
  );
}

/**
 * Extract safe request metadata (target / location / language) from a
 * DataForSEO task payload echo or a request input object. Only known-safe
 * field names are copied; everything else is ignored.
 */
export function extractSafeRequestMetadata(
  input: unknown,
): DataforseoCallDiagnostics["request"] {
  if (typeof input !== "object" || input === null) return undefined;
  const get = (key: string): unknown => Reflect.get(input, key);
  const request: NonNullable<DataforseoCallDiagnostics["request"]> = {};
  const target = get("target");
  if (typeof target === "string") {
    request.target = target;
  }
  const domain = get("domain");
  if (typeof domain === "string" && request.target === undefined) {
    request.target = domain;
  }
  const locationCode = get("location_code");
  if (typeof locationCode === "number") {
    request.locationCode = locationCode;
  }
  const locationCodeCamel = get("locationCode");
  if (
    typeof locationCodeCamel === "number" &&
    request.locationCode === undefined
  ) {
    request.locationCode = locationCodeCamel;
  }
  const locationName = get("location_name");
  if (typeof locationName === "string") {
    request.locationName = locationName;
  }
  const locationNameCamel = get("locationName");
  if (
    typeof locationNameCamel === "string" &&
    request.locationName === undefined
  ) {
    request.locationName = locationNameCamel;
  }
  const languageCode = get("language_code");
  if (typeof languageCode === "string") {
    request.languageCode = languageCode;
  }
  const languageCodeCamel = get("languageCode");
  if (
    typeof languageCodeCamel === "string" &&
    request.languageCode === undefined
  ) {
    request.languageCode = languageCodeCamel;
  }
  const languageName = get("language_name");
  if (typeof languageName === "string") {
    request.languageName = languageName;
  }
  const languageNameCamel = get("languageName");
  if (
    typeof languageNameCamel === "string" &&
    request.languageName === undefined
  ) {
    request.languageName = languageNameCamel;
  }
  return Object.keys(request).length > 0 ? request : undefined;
}

/**
 * Shape a trace event's metadata from a diagnostics record. The trace bus
 * scrubs string leaves as the last line of defense; this stays a plain
 * Record<string, unknown> to fit SamToolTraceEvent.metadata.
 */
export function diagnosticsToTraceMetadata(
  diagnostics: DataforseoCallDiagnostics,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (diagnostics.endpoint) metadata.endpoint = diagnostics.endpoint;
  if (diagnostics.api) metadata.api = diagnostics.api;
  metadata.httpStatus = diagnostics.httpStatus ?? null;
  if (diagnostics.transportError) {
    metadata.transportError = diagnostics.transportError;
  }
  metadata.dataforseoStatus = diagnostics.dataforseoStatus ?? null;
  if (diagnostics.dataforseoMessage) {
    metadata.dataforseoMessage = diagnostics.dataforseoMessage;
  }
  if (diagnostics.request) {
    metadata.request = { ...diagnostics.request };
  }
  if (diagnostics.responseShape) {
    metadata.responseShape = { ...diagnostics.responseShape };
  }
  return metadata;
}

/**
 * Extract a diagnostics record from a trace event's metadata, re-narrowing
 * at the wire boundary. Returns null when the metadata carries no
 * DataForSEO diagnostics.
 */
export function diagnosticsFromTraceEvent(
  event: Pick<SamToolTraceEvent, "metadata">,
): DataforseoCallDiagnostics | null {
  const metadata = event.metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  if (
    !("endpoint" in metadata) &&
    !("transportError" in metadata) &&
    !("dataforseoStatus" in metadata) &&
    !("httpStatus" in metadata)
  ) {
    return null;
  }
  return metadata as DataforseoCallDiagnostics;
}
