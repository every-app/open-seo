import { classifyToolInputError } from "./toolInputErrors";

// Provider-neutral classification of AI-provider failures (Phase Q). Every
// provider adapter surfaces failures through normalizeProviderError, so the
// settings UI and the SAM agent render one consistent, actionable vocabulary
// regardless of vendor. Raw provider payloads never reach users: no keys, no
// authorization headers, no stacks — only curated messages.
//
// Classification is deliberately duck-typed rather than instanceof-based:
// bundling can duplicate SDK classes across module graphs, and Think surfaces
// in-stream errors as plain strings. Shape beats identity here. The one
// exception (Phase V): the AI SDK's tool-input errors are detected through
// their official `isInstance` predicates — these are keyed on `Symbol.for`
// global markers, so they work across duplicated SDK copies — plus
// name/message duck-typing for stringified forms (see toolInputErrors.ts).

export type AIProviderErrorCode =
  | "AUTH_ERROR"
  | "MODEL_UNAVAILABLE"
  | "DATA_POLICY_BLOCKED"
  | "INVALID_BASE_URL"
  | "INVALID_RESPONSE"
  | "RATE_LIMITED"
  | "PROVIDER_INSUFFICIENT_CREDITS"
  | "PROVIDER_UNAVAILABLE"
  | "CONNECTION_TIMEOUT"
  | "UNSUPPORTED_FEATURE"
  | "TOOL_INPUT_INVALID"
  | "UNKNOWN";

export type NormalizedProviderError = {
  code: AIProviderErrorCode;
  /** Provider id when known at the call site ("openrouter", …). */
  provider?: string;
  model?: string;
  /** Tool name for TOOL_INPUT_INVALID — the request that was rejected. */
  toolName?: string;
  /** Curated, user-safe explanation. No secrets, no raw stacks. */
  message: string;
  /** Only transient failures are retryable; policy/auth/model errors are not. */
  retryable: boolean;
  /**
   * Seconds the provider asked us to wait before retrying, when it sent a
   * Retry-After header. Null when the provider gave no guidance. Only
   * meaningful for retryable codes; never licenses an immediate retry.
   */
  retryAfterSeconds?: number | null;
};

/** Approved user-facing links (the only URLs a normalized message may carry). */
export const OPENROUTER_PRIVACY_URL = "https://openrouter.ai/settings/privacy";

type WithStatus = { statusCode?: unknown; status?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statusCodeOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const status =
    (error as WithStatus).statusCode ?? (error as WithStatus).status;
  return typeof status === "number" ? status : undefined;
}

function textOf(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
  // Duck-typed error objects (retry-unwrapped payloads, plain APICallError
  // records from cross-bundle SDK copies): surface their message text so the
  // pattern-based classifiers can see it.
  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Unwrap the AI SDK's retry wrapper: after exhausting attempts it throws a
 * RetryError whose `.errors[]` holds each attempt's failure. The LAST
 * underlying error carries the meaningful status/body.
 */
function lastUnderlyingError(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error) || !("errors" in error)) return null;
  const attempts: unknown[] = Array.isArray(error.errors) ? error.errors : [];
  const last = attempts[attempts.length - 1];
  return isRecord(last) ? last : null;
}

function matches(haystack: string, patterns: RegExp[]): RegExp | null {
  return patterns.find((pattern) => pattern.test(haystack)) ?? null;
}

const DATA_POLICY_PATTERNS = [
  /data policy/i,
  /zero data retention/i,
  /no endpoints found matching/i,
];

// OpenRouter's in-flight credit guard (HTTP 402,
// reason=in_flight_budget_exhausted). Matched on text first: the same
// wording surfaces through APICallError messages, retry wrappers, and plain
// in-stream error strings, and the status code alone is not specific enough.
const INSUFFICIENT_CREDITS_PATTERNS = [
  /in_flight_budget_exhausted/i,
  /would exceed your available credits/i,
  /insufficient credits/i,
];

/** Max sane Retry-After, so a hostile/garbage header can't stall a turn. */
const MAX_RETRY_AFTER_SECONDS = 600;

/**
 * Parse a Retry-After value (seconds form only — we never wait on the
 * HTTP-date form). Returns null for anything absent, non-numeric, or
 * out of range.
 */
export function parseRetryAfterSeconds(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = typeof value === "number" ? value : value.trim();
  const parsed =
    typeof trimmed === "number" ? trimmed : Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed > MAX_RETRY_AFTER_SECONDS) return MAX_RETRY_AFTER_SECONDS;
  return Math.ceil(parsed);
}

function classifyStatus(
  status: number | undefined,
): AIProviderErrorCode | null {
  switch (status) {
    case 401:
    case 403:
      return "AUTH_ERROR";
    case 402:
      // Payment Required: the provider account has insufficient credits
      // for this request. Distinct from AUTH_ERROR — the key is fine, the
      // balance is not.
      return "PROVIDER_INSUFFICIENT_CREDITS";
    case 404:
      // A bare 404 from a chat/completions route means the route/model does
      // not exist there; policy-specific 404s are matched by message first.
      return "MODEL_UNAVAILABLE";
    case 408:
      return "CONNECTION_TIMEOUT";
    case 429:
      return "RATE_LIMITED";
    case 400:
      return "INVALID_RESPONSE";
    default:
      if (status !== undefined && status >= 500) return "PROVIDER_UNAVAILABLE";
      return null;
  }
}

function messageFor(
  code: AIProviderErrorCode,
  detail: string,
  provider?: string,
): string {
  const who = provider ?? "The provider";
  switch (code) {
    case "DATA_POLICY_BLOCKED":
      return (
        `${who} could not find an endpoint compatible with your current ` +
        "Zero Data Retention policy for this model. Choose a compatible " +
        "model or adjust your OpenRouter privacy settings."
      );
    case "AUTH_ERROR":
      return `${who} rejected the API key. Check that the configured credential is valid.`;
    case "MODEL_UNAVAILABLE":
      return (
        `${who} returned 404 — the model "${detail}" may be unavailable ` +
        "or misconfigured. Choose another model."
      );
    case "RATE_LIMITED":
      return `${who} is rate limiting requests. Wait a moment and try again.`;
    case "PROVIDER_INSUFFICIENT_CREDITS":
      return (
        "Your AI provider has insufficient available credits for this request. " +
        "Wait for in-flight requests to settle or add credits, then try again."
      );
    case "INVALID_BASE_URL":
      return `The configured Base URL for ${who} is invalid or unreachable.`;
    case "CONNECTION_TIMEOUT":
      return `${who} did not respond in time. Try again shortly.`;
    case "PROVIDER_UNAVAILABLE":
      return `${who} is temporarily unavailable (server error). Try again shortly.`;
    case "INVALID_RESPONSE":
      return `${who} returned a response this app could not parse.`;
    case "UNSUPPORTED_FEATURE":
      return `${who} does not support a required feature (such as tool calling) for this model.`;
    case "TOOL_INPUT_INVALID":
      // Normally composed by toolInputErrors.ts (with tool name + validation
      // detail); this is the fallback when only the code is known.
      return "Invalid tool arguments — the request was not executed and no provider call was made.";
    default:
      return `${who} request failed: ${detail}`;
  }
}

const NON_RETRYABLE: ReadonlySet<AIProviderErrorCode> = new Set([
  "AUTH_ERROR",
  "DATA_POLICY_BLOCKED",
  "INVALID_BASE_URL",
  "UNSUPPORTED_FEATURE",
  "MODEL_UNAVAILABLE",
  // A tool-input failure is not a transport error: retrying the identical
  // request re-fails validation. The expected loop is the model receiving
  // the validation feedback and correcting its arguments (bounded by
  // AI_AGENT_MAX_STEPS / AI_AGENT_MAX_TOOL_CALLS), never an automatic retry.
  "TOOL_INPUT_INVALID",
  // The account balance is exhausted (or fully consumed by in-flight
  // requests): retrying immediately re-hits the same guard. A retry is only
  // meaningful after the provider's Retry-After window or a top-up, and the
  // user — not the loop — must trigger it.
  "PROVIDER_INSUFFICIENT_CREDITS",
]);

/**
 * Precise provider-capability matching (V3). The old heuristic matched the
 * bare word "tool", so ANY text mentioning a tool — including the AI SDK's
 * argument-validation wording "Invalid input for tool get_serp_results…" —
 * read as "the provider lacks tool calling". A capability failure now
 * requires BOTH a capability term and a refusal term. Validation wording
 * ("Invalid input for tool…", "Unknown key…", "Invalid tool arguments…")
 * never pairs them, and tool-input failures are classified earlier anyway.
 */
const TOOL_CAPABILITY_TERMS =
  /tool calling|function calling|tool use|\btools\b/i;
const CAPABILITY_REFUSAL_TERMS =
  /not supported|doesn't support|does not support|unsupported|unavailable for this model/i;

function isProviderCapabilityRefusal(rawText: string): boolean {
  return (
    TOOL_CAPABILITY_TERMS.test(rawText) &&
    CAPABILITY_REFUSAL_TERMS.test(rawText)
  );
}

/**
 * Classify any thrown value from a provider call into the normalized shape.
 * `provider`/`model` enrich messages when the caller knows them.
 */
export function normalizeProviderError(
  error: unknown,
  provider?: string,
  model?: string,
): NormalizedProviderError {
  const rawText = textOf(error);
  const candidates: Record<string, unknown>[] = [];
  const underlying = lastUnderlyingError(error);
  if (underlying) candidates.push(underlying);
  if (isRecord(error)) candidates.push(error);

  // Tool-input failures are classified BEFORE every provider signal (V2):
  // they never involve the provider at all, so no later heuristic may claim
  // them. This is the fix for the 2026-09-02 incident, where these failures
  // fell through to the capability regex and blamed an innocent provider.
  const toolInput = classifyToolInputError(error, candidates, rawText);
  if (toolInput) {
    return {
      code: "TOOL_INPUT_INVALID",
      // Deliberately NO provider: this failure never reached one, and the
      // message must never read as provider blame (V6).
      model,
      toolName: toolInput.toolName ?? undefined,
      message: toolInput.message,
      retryable: false,
      retryAfterSeconds: null,
    };
  }

  // Data-policy blocks: match on text FIRST because vendors vary in whether
  // the policy refusal is a 404 or a 200-wrapped error object.
  const policyHit = matches(rawText, DATA_POLICY_PATTERNS);
  if (policyHit) {
    return {
      code: "DATA_POLICY_BLOCKED",
      provider,
      model,
      message: messageFor("DATA_POLICY_BLOCKED", "", provider),
      retryable: false,
    };
  }

  // Insufficient provider credits: also matched on text FIRST. OpenRouter's
  // in-flight budget refusal carries its distinctive wording in the message
  // body regardless of which surface (status code, retry wrapper, or plain
  // in-stream string) delivered it — and a 402 with different wording must
  // still classify correctly, so both signals feed the code below.
  const creditsHit = matches(rawText, INSUFFICIENT_CREDITS_PATTERNS);

  let status: number | undefined;
  for (const candidate of candidates) {
    status = statusCodeOf(candidate);
    if (status !== undefined) break;
  }
  const statusCode = classifyStatus(status);

  if (creditsHit) {
    return {
      code: "PROVIDER_INSUFFICIENT_CREDITS",
      provider,
      model,
      message: messageFor("PROVIDER_INSUFFICIENT_CREDITS", "", provider),
      retryable: false,
      retryAfterSeconds: retryAfterFrom(candidates),
    };
  }

  // Network-level failures surface as TypeError("fetch failed") with cause
  // codes, or URL parse problems before any request leaves.
  const networkHit = matches(rawText, [
    /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|certificate|SSL/i,
  ]);
  const socketHit = matches(rawText, [
    /socket hang up|EPIPE|other side closed/i,
  ]);
  const invalidUrlHit = matches(rawText, [
    /Invalid URL|Failed to parse URL|base.?url/i,
  ]);

  let code: AIProviderErrorCode = "UNKNOWN";
  if (invalidUrlHit) code = "INVALID_BASE_URL";
  else if (statusCode) code = statusCode;
  else if (socketHit) code = "PROVIDER_UNAVAILABLE";
  else if (/ETIMEDOUT|timed?\s?out/i.test(rawText)) {
    code = "CONNECTION_TIMEOUT";
  } else if (networkHit) {
    code = /ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(rawText)
      ? "INVALID_BASE_URL"
      : "PROVIDER_UNAVAILABLE";
  } else if (/aborted|aborted without output/i.test(rawText)) {
    code = "CONNECTION_TIMEOUT";
  } else if (isProviderCapabilityRefusal(rawText)) {
    code = "UNSUPPORTED_FEATURE";
  }

  const detail =
    model ??
    (error instanceof Error && error.message
      ? error.message.slice(0, 160)
      : "");
  return {
    code,
    provider,
    model,
    message: messageFor(code, detail, provider),
    retryable: !NON_RETRYABLE.has(code),
    // Surfaces the provider's Retry-After whenever the code is one where
    // waiting is meaningful; null otherwise.
    retryAfterSeconds:
      code === "RATE_LIMITED" ||
      code === "PROVIDER_UNAVAILABLE" ||
      code === "PROVIDER_INSUFFICIENT_CREDITS"
        ? retryAfterFrom(candidates)
        : null,
  };
}

/**
 * Find a Retry-After value on any candidate object. Vendors and SDK layers
 * store it in different shapes — a direct `retryAfter`/`retry-after` field,
 * or nested inside a headers map (`responseHeaders: {"retry-after": "120"}`,
 * `headers: { "Retry-After": ... }}`). Scan both levels; the first parseable
 * value wins.
 */
function retryAfterFrom(candidates: Record<string, unknown>[]): number | null {
  for (const candidate of candidates) {
    const parsed = retryAfterFromRecord(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function retryAfterFromRecord(record: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(record)) {
    const keyIsRetryAfter = /retry.?after/i.test(key);
    if (keyIsRetryAfter) {
      const parsed = parseRetryAfterSeconds(value);
      if (parsed !== null) return parsed;
    }
    // Descend one level into header-map containers regardless of their key
    // name ("responseHeaders", "headers", vendor metadata bags).
    if (!keyIsRetryAfter && isRecord(value)) {
      for (const [innerKey, innerValue] of Object.entries(value)) {
        if (!/retry.?after/i.test(innerKey)) continue;
        const innerParsed = parseRetryAfterSeconds(innerValue);
        if (innerParsed !== null) return innerParsed;
      }
    }
  }
  return null;
}
