// Provider-neutral classification of AI-provider failures (Phase Q). Every
// provider adapter surfaces failures through normalizeProviderError, so the
// settings UI and the SAM agent render one consistent, actionable vocabulary
// regardless of vendor. Raw provider payloads never reach users: no keys, no
// authorization headers, no stacks — only curated messages.
//
// Classification is deliberately duck-typed rather than instanceof-based:
// bundling can duplicate SDK classes across module graphs, and Think surfaces
// in-stream errors as plain strings. Shape beats identity here.

export type AIProviderErrorCode =
  | "AUTH_ERROR"
  | "MODEL_UNAVAILABLE"
  | "DATA_POLICY_BLOCKED"
  | "INVALID_BASE_URL"
  | "INVALID_RESPONSE"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "CONNECTION_TIMEOUT"
  | "UNSUPPORTED_FEATURE"
  | "UNKNOWN";

export type NormalizedProviderError = {
  code: AIProviderErrorCode;
  /** Provider id when known at the call site ("openrouter", …). */
  provider?: string;
  model?: string;
  /** Curated, user-safe explanation. No secrets, no raw stacks. */
  message: string;
  /** Only transient failures are retryable; policy/auth/model errors are not. */
  retryable: boolean;
};

/** OpenRouter privacy settings — linked only for DATA_POLICY_BLOCKED. */
export const OPENROUTER_PRIVACY_URL = "https://openrouter.ai/settings/privacy";

type WithStatus = { statusCode?: unknown; status?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statusCodeOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const status = (error as WithStatus).statusCode ?? (error as WithStatus).status;
  return typeof status === "number" ? status : undefined;
}

function textOf(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
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

function matches(
  haystack: string,
  patterns: RegExp[],
): RegExp | null {
  return patterns.find((pattern) => pattern.test(haystack)) ?? null;
}

const DATA_POLICY_PATTERNS = [
  /data policy/i,
  /zero data retention/i,
  /no endpoints found matching/i,
];

function classifyStatus(status: number | undefined): AIProviderErrorCode | null {
  switch (status) {
    case 401:
    case 403:
      return "AUTH_ERROR";
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
]);

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

  let status: number | undefined;
  for (const candidate of candidates) {
    status = statusCodeOf(candidate);
    if (status !== undefined) break;
  }
  const statusCode = status !== undefined ? classifyStatus(status) : null;

  // Network-level failures surface as TypeError("fetch failed") with cause
  // codes, or URL parse problems before any request leaves.
  const networkHit = matches(rawText, [
    /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|certificate|SSL/i,
  ]);
  const socketHit = matches(rawText, [/socket hang up|EPIPE|other side closed/i]);
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
  } else if (/tool|function calling/i.test(rawText)) {
    code = "UNSUPPORTED_FEATURE";
  }

  const detail =
    model ??
    (error instanceof Error && error.message ? error.message.slice(0, 160) : "");
  return {
    code,
    provider,
    model,
    message: messageFor(code, detail, provider),
    retryable: !NON_RETRYABLE.has(code),
  };
}
