// Normalized SAM tool-call trace events (Phase DT — Debug Trace).
//
// The single event vocabulary every instrumentation seam emits and the client
// Debug Trace panel consumes. Shared between server and client so the wire
// payload and the UI reducer can never drift.
//
// SECURITY INVARIANT: events carry only sanitized, non-sensitive metadata —
// tool names, provider names, normalized failure classes, HTTP status codes,
// counters, durations. Never raw provider messages, credentials, headers,
// authorization material, or request payloads (they may carry user content
// and API keys). The emitters are responsible for that; samTraceBus enforces
// it with a scrubber as the last line of defense.

export type SamToolTraceEventName =
  | "model_attempt"
  | "gate_allowed"
  | "gate_blocked"
  | "handler_start"
  | "handler_success"
  | "handler_error"
  | "provider_request"
  | "provider_success"
  | "provider_error"
  | "retry_scheduled"
  | "retry_executed"
  | "fallback_selected"
  | "cache_hit"
  | "cache_miss"
  | "cache_write"
  | "cache_write_skipped"
  | "tool_completed";

export type SamToolTraceEvent = {
  id: string;
  turnId: string;
  timestamp: number;
  /** Monotonic per-conversation sequence (ordering across seams). */
  sequence: number;

  toolName?: string;
  /** Data/data-source provider ("dataforseo", "gsc", "internal", "cache") — never the AI provider. */
  provider?: string;

  event: SamToolTraceEventName;

  /** 1-based attempt index within the tool's turn lifecycle. */
  attempt?: number;

  /** Normalized failure class (samToolRecovery vocabulary). */
  errorCode?: string;
  httpStatus?: number;

  retryAllowed?: boolean;
  blocked?: boolean;

  durationMs?: number;

  cacheHit?: boolean;
  cacheWrite?: boolean;

  /** Human-readable fallback sources selected at runtime. */
  fallbackHint?: string;

  metadata?: Record<string, unknown>;
};

/** Wire frame the DO broadcasts to connected clients. */
export type SamTraceFrame = {
  type: "sam_trace";
  /** Turn id for the snapshot. */
  turnId?: string;
  /** Full event list for the current turn (snapshot; client replaces state). */
  events: SamToolTraceEvent[];
  /** Effective AI provider/model — the "AI:" header. Distinct from data providers. */
  ai: { provider: string; model: string | null };
};

/** The data-provider identity of a tool, derived from runtime execution only. */
export type SamToolProviderInfo = {
  toolName: string;
  /** DataForSEO / GSC / Internal / Cache / … — null when nothing executed. */
  provider: string | null;
  httpStatus: number | null;
  ok: boolean;
};

/** Scrub a string of anything that looks like credential material. */
export function scrubTraceText(value: string): string {
  // Bearer tokens, basic-auth material, sk- style keys, long base64 blobs.
  return value
    .replace(/\b(?:Bearer|Basic)\s+[\w./+=-]+/gi, "[redacted]")
    .replace(/\bsk-[\w-]+/g, "[redacted]")
    .replace(/["'`](?:authorization|api[-_]?key|token|secret)["'`]\s*[:=]\s*[^,}\s]+/gi, "[redacted]");
}
