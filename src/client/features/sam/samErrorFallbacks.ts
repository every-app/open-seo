import type { AIProviderErrorCode } from "@/server/features/ai/providerErrors";

// Client-side defense-in-depth (Phase U3) for SAM chat turn errors.
//
// The server normalizes provider failures into curated, secret-free messages
// at two seams (onChatError for turn-level errors, the stream-error guard for
// in-stream errors). This module is the LAST line of defense for the client:
// if some future seam lets a raw provider payload through, the error the UI
// renders must still be one of the curated messages — never vendor text with
// user ids, headers, stacks, or remedy URLs.
//
// Recognition is one-directional: match a known curated message (or one of
// its stable code prefixes — the server may append "provider: code" tags),
// and pass it through; anything else degrades to the generic message. The
// generic message matches the server's UNKNOWN fallback vocabulary.

/** Every curated message the server can deliver, keyed by code. */
export const SAM_ERROR_FALLBACKS: Record<AIProviderErrorCode, string> = {
  AUTH_ERROR:
    "The provider rejected the API key. Check that the configured credential is valid.",
  MODEL_UNAVAILABLE:
    "The provider returned 404 — the model may be unavailable or misconfigured. Choose another model.",
  DATA_POLICY_BLOCKED:
    "The provider could not find an endpoint compatible with your current Zero Data Retention policy for this model. Choose a compatible model or adjust your privacy settings.",
  INVALID_BASE_URL:
    "The configured Base URL for the provider is invalid or unreachable.",
  INVALID_RESPONSE:
    "The provider returned a response this app could not parse.",
  RATE_LIMITED:
    "The provider is rate limiting requests. Wait a moment and try again.",
  PROVIDER_INSUFFICIENT_CREDITS:
    "Your AI provider has insufficient available credits for this request. Wait for in-flight requests to settle or add credits, then try again.",
  PROVIDER_UNAVAILABLE:
    "The provider is temporarily unavailable (server error). Try again shortly.",
  CONNECTION_TIMEOUT:
    "The provider did not respond in time. Try again shortly.",
  UNSUPPORTED_FEATURE:
    "The provider does not support a required feature (such as tool calling) for this model.",
  TOOL_INPUT_INVALID:
    "A tool request was rejected because its arguments were invalid, so it was not executed. The arguments need to be corrected before retrying.",
  UNKNOWN: "The AI provider could not complete this request.",
};

/** Full curated messages exactly as the server can send them. */
const CURATED_MESSAGES: ReadonlySet<string> = new Set(
  (Object.values(SAM_ERROR_FALLBACKS) as string[]).map((m) =>
    normalizeWhitespace(m),
  ),
);

/**
 * Invariant tails of the curated messages after the provider-name prefix:
 * "OpenRouter rejected the API key. …" must end with the AUTH_ERROR tail.
 * Built from the fallback map so wording can't drift between the two lists.
 */
const CURATED_SUFFIXES: readonly string[] = [
  "rejected the API key. Check that the configured credential is valid.",
  "could not find an endpoint compatible with your current Zero Data Retention policy for this model. Choose a compatible model or adjust your OpenRouter privacy settings.",
  "is rate limiting requests. Wait a moment and try again.",
  "has insufficient available credits for this request. Wait for in-flight requests to settle or add credits, then try again.",
  "is temporarily unavailable (server error). Try again shortly.",
  "did not respond in time. Try again shortly.",
  "returned a response this app could not parse.",
  "does not support a required feature (such as tool calling) for this model.",
  "is invalid or unreachable.",
  // TOOL_INPUT_INVALID: the server composes "Invalid tool arguments for
  // <tool>: <validation detail>. The request was not executed and no
  // provider call was made." — the variable head carries the safe schema
  // diagnosis; this tail is its pass-through invariant. Never a provider
  // sentence (Phase V: no provider blame for schema failures).
  "The request was not executed and no provider call was made.",
].map(normalizeWhitespace);

// Stable fragments that must survive even if the wording drifts: the
// provider-prefix form is "… <fragment>". Each fragment is distinctive
// enough that a raw vendor payload cannot accidentally contain it.
const PROVIDER_INSUFFICIENT_CREDITS_MARKER =
  "insufficient available credits for this request";

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Map an arbitrary error string to a message safe for the chat UI.
 * Passes through: exact curated messages, curated messages with any
 * provider-name prefix, and non-provider app errors that are short, single
 * line, and contain no vendor markers (headers, ids, URLs, stacks).
 * Everything else degrades to the generic provider-failure message.
 */
export function safeSamErrorMessage(raw: string | null | undefined): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return SAM_ERROR_FALLBACKS.UNKNOWN;

  const normalized = normalizeWhitespace(text);

  // Exact curated message (server sends these today).
  if (CURATED_MESSAGES.has(normalized)) return normalized;

  // Curated message with a provider prefix ("OpenRouter rejected the API
  // key. ..." ends with the invariant suffix).
  for (const suffix of CURATED_SUFFIXES) {
    if (normalized.length > suffix.length && normalized.endsWith(suffix)) {
      return normalized;
    }
  }

  // The credits message is the one this defense exists for; match its stable
  // fragment even when the provider prefix wording changes.
  if (normalized.includes(PROVIDER_INSUFFICIENT_CREDITS_MARKER)) {
    return SAM_ERROR_FALLBACKS.PROVIDER_INSUFFICIENT_CREDITS;
  }

  // Vendor wording from the 2026-09-01 incident (OpenRouter 402
  // in_flight_budget_exhausted): map the distinctive phrases to the curated
  // credits message. These MUST be checked before the app-message heuristic
  // below — the raw payload is short, single-line, and otherwise "clean"
  // enough to pass it.
  if (
    /would exceed your available credits/i.test(normalized) ||
    /in-flight requests settle/i.test(normalized) ||
    /in_flight_budget_exhausted/i.test(normalized)
  ) {
    return SAM_ERROR_FALLBACKS.PROVIDER_INSUFFICIENT_CREDITS;
  }

  // Known provider error wording (beyond the credits case above): map to
  // the matching curated message so users still get actionable text. These
  // are vendor phrases, not app copy — they are matched, never rendered.
  if (/data policy|zero data retention/i.test(normalized)) {
    return SAM_ERROR_FALLBACKS.DATA_POLICY_BLOCKED;
  }
  // Tool-input validation wording escaping to the client (Phase V): the AI
  // SDK's own phrases for a tool request rejected before execution. Map to
  // the tool-input fallback — never to a provider capability message, so a
  // schema failure can never render as provider blame.
  if (
    /Invalid input for tool |Model tried to call unavailable tool|Invalid tool arguments for |Error repairing tool call/i.test(
      normalized,
    )
  ) {
    return SAM_ERROR_FALLBACKS.TOOL_INPUT_INVALID;
  }
  if (/rate limit/i.test(normalized)) {
    return SAM_ERROR_FALLBACKS.RATE_LIMITED;
  }
  if (
    /socket hang up|bad gateway|server error|temporarily unavailable/i.test(
      normalized,
    )
  ) {
    return SAM_ERROR_FALLBACKS.PROVIDER_UNAVAILABLE;
  }
  if (/timed?\s?out|did not respond in time/i.test(normalized)) {
    return SAM_ERROR_FALLBACKS.CONNECTION_TIMEOUT;
  }
  if (/rejected the api key|invalid api key|unauthorized/i.test(normalized)) {
    return SAM_ERROR_FALLBACKS.AUTH_ERROR;
  }
  if (
    /no endpoints found|model .* (unavailable|misconfigured)/i.test(normalized)
  ) {
    return SAM_ERROR_FALLBACKS.MODEL_UNAVAILABLE;
  }

  // Heuristic guard for app-authored messages (e.g. Think's own protocol
  // errors like the stream-stall sentinel): allow short, single-line, plain
  // sentences with no vendor payload markers. Anything that looks like a raw
  // provider response (headers, ids, JSON, stacks, URLs) degrades below.
  if (isSafeAppAuthoredMessage(normalized)) return normalized;

  return SAM_ERROR_FALLBACKS.UNKNOWN;
}

const VENDOR_PAYLOAD_MARKERS: RegExp[] = [
  /user_id/i,
  /cf-ray/i,
  /responseBody|statusCode/i,
  /requestId"\s*:/i,
  /sk-[a-z0-9-]{8,}/i,
  /authorization|bearer/i,
  /\bhttps?:\/\/\S+/i, // no URLs — the only approved links live in curated text above
  /\bat\s.+\(.*:\d+:\d+\)/, // stack frames "at postToApi (file.js:2310:14)" / "at fn (file:1:2)"
  /\{.*"message"/s, // raw JSON error bodies
];

function isSafeAppAuthoredMessage(text: string): boolean {
  if (text.length > 300) return false;
  if (text.includes("\n")) return false;
  if (VENDOR_PAYLOAD_MARKERS.some((marker) => marker.test(text))) return false;
  return true;
}
