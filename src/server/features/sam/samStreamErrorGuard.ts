import type { StreamableResult } from "@cloudflare/think";
import {
  normalizeProviderError,
  type AIProviderErrorCode,
} from "@/server/features/ai/providerErrors";

// Stream-boundary error normalization (Phase U1).
//
// Think converts an in-stream provider failure into the error text the client
// (and the durable cf:chat:last-terminal record) will see by calling the
// result's `toUIMessageStream({ onError })` — defaulting to a function that
// stringifies the raw provider error. That seam BYPASSES SamChatAgent's
// onChatError hook entirely: the raw vendor payload (user ids, headers,
// remedy URLs) streamed straight into the chat UI and the DO terminal state
// in production (incident 2026-09-01, OpenRouter 402 in_flight_budget_exhausted).
//
// This module is the fix: it wraps the inference result so every error that
// crosses the stream boundary — whatever options Think passes — is first
// normalized through the same providerErrors vocabulary onChatError uses.
// The normalized message is what gets emitted to the client, persisted in the
// terminal record, and replayed on reconnect; the original error still
// reaches onChatError for logging (unchanged behavior — Think passes the raw
// error there separately).
//
// Provider/model come from the DO's per-turn state (resolveSamEffectiveConfig
// ran in beforeTurn); they enrich classification exactly like the
// onChatError call site.

export type StreamErrorNormalizer = (error: unknown) => string;

/** Optional observer for tool-input rejections crossing the stream seam. */
export type ToolInputRejectionObserver = (event: {
  tool: string | null;
  errorClass: string;
}) => void;

/** Curried for tests: build the onError that maps raw errors to safe text. */
export function createStreamErrorNormalizer(input: {
  provider: string;
  model: string | null;
  normalize?: (
    error: unknown,
    provider?: string,
    model?: string,
  ) => {
    code: AIProviderErrorCode;
    message: string;
    toolName?: string;
  };
  /** Phase V observability: notified once per tool-input rejection. */
  onToolInputError?: ToolInputRejectionObserver;
}): StreamErrorNormalizer {
  const normalize = input.normalize ?? normalizeProviderError;
  // Per-normalizer dedup: the AI SDK v6's toUIMessageStream calls onError
  // TWICE per invalid tool call — once for tool-input-error and once for
  // tool-output-error on the same tool_call. Deduplicate so the recovery
  // budget isn't double-counted.
  const notifiedToolRejections = new Set<string>();

  return (error: unknown) => {
    // Preserve Think's own in-stream sentinel strings: these are protocol
    // messages (not provider payloads) the client and recovery machinery key
    // on, and normalizing them would corrupt the recovery contract.
    if (typeof error === "string" && isThinkStreamSentinel(error)) {
      return error;
    }
    try {
      const normalized = normalize(
        error,
        input.provider,
        input.model ?? undefined,
      );
      if (normalized.code === "TOOL_INPUT_INVALID") {
        const tool = normalized.toolName ?? null;
        if (tool) {
          if (!notifiedToolRejections.has(tool)) {
            notifiedToolRejections.add(tool);
            input.onToolInputError?.({
              tool,
              errorClass: errorClassOf(error),
            });
          }
        } else {
          input.onToolInputError?.({
            tool: null,
            errorClass: errorClassOf(error),
          });
        }
      }
      return normalized.message;
    } catch {
      // Normalization must never throw inside the stream pipeline — degrade
      // to the generic curated message, never the raw error text.
      return "The AI provider could not complete this request.";
    }
  };
}

/**
 * The SDK error class for the rejection log line — a constant class name
 * ("AI_InvalidToolInputError"), never payload text.
 */
function errorClassOf(error: unknown): string {
  const name =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown }).name
      : undefined;
  if (typeof name === "string" && name !== "") return name;
  if (typeof error === "string") return "tool-input-text";
  return "unknown";
}

// Strings Think itself puts on the stream error channel. Durable-frame and
// watchdog/abort paths deliver these; they contain no vendor payload.
const THINK_STREAM_SENTINELS = new Set([
  "chat stream stalled: inactivity watchdog fired",
  "Stream error",
  "The assistant was interrupted.",
]);

function isThinkStreamSentinel(text: string): boolean {
  return THINK_STREAM_SENTINELS.has(text);
}

/**
 * Wrap a Think StreamableResult so its `toUIMessageStream` always uses the
 * normalizing onError — regardless of which onError the caller passes.
 * Think hard-codes its own stringifier at every call site, so the wrapper
 * intentionally overrides it rather than defaulting when absent.
 */
export function withNormalizedStreamErrors(
  result: StreamableResult,
  normalizer: StreamErrorNormalizer,
): StreamableResult {
  return {
    ...result,
    toUIMessageStream(options) {
      const inner = result.toUIMessageStream({
        ...options,
        onError: (error: unknown) => {
          // Run the normalizer first so its behavior is observable even if a
          // caller-supplied onError is present; the normalized text is what
          // the stream must carry. The caller's onError (when it exists) is
          // still invoked with the ORIGINAL error for logging/telemetry.
          options?.onError?.(error);
          return normalizer(error);
        },
      });
      return inner;
    },
  };
}

/**
 * The DO-facing composition for SamChatAgent's `_transformInferenceResult`
 * override. Takes the turn state (updated by beforeTurn / getModel before the
 * inference loop runs) and returns the wrapped result. Extracted so the
 * composition is unit-testable without instantiating the Durable Object
 * (Think needs the workers runtime); the DO override is a one-line call to
 * this.
 */
export function samStreamErrorGuard(
  turn: { provider: string; model: string | null },
  result: StreamableResult,
  onToolInputError?: ToolInputRejectionObserver,
): StreamableResult {
  return withNormalizedStreamErrors(
    result,
    createStreamErrorNormalizer({
      provider: turn.provider,
      model: turn.model,
      onToolInputError,
    }),
  );
}

/**
 * One-line DO wiring for the guard above: routes the structured rejection log
 * through `logRejection` and counts SDK-level input rejections (which never
 * reach tool execute()) in the per-turn recovery budget via `recordRejection`.
 * Both callbacks are optional and no-op safe, so the call site stays small.
 */
export function guardSamInferenceResult(
  turn: { provider: string; model: string | null },
  result: StreamableResult,
  logRejection?: (event: {
    toolName: string | null;
    errorClass: string;
  }) => void,
  recordRejection?: (toolName: string) => void,
): StreamableResult {
  if (!logRejection) return samStreamErrorGuard(turn, result);
  return samStreamErrorGuard(turn, result, (event) => {
    logRejection({ toolName: event.tool, errorClass: event.errorClass });
    if (event.tool) recordRejection?.(event.tool);
  });
}
