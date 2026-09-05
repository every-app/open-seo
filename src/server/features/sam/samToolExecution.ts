// Per-conversation tool-call tracking for SAM: a bounded dedup cache (the model
// sometimes re-requests the exact same tool call within a turn — e.g. after a
// stall or a retry) plus structured logging of every tool execution.
//
// The cache lives on the SamChatAgent DO instance (one DO per session), so it
// survives across turns of the same conversation but is lost if the DO is
// evicted — which is fine: dedup exists to stop redundant calls within an
// active session, not to persist results across DO restarts.

type CacheKey = string;

export type ToolExecutionTracker = {
  /** Returns the cached output for an identical prior call, or undefined. */
  getCached(toolName: string, args: unknown): unknown;
  /** Records a successful output so an identical repeat is served from cache. */
  setCached(toolName: string, args: unknown, output: unknown): void;
  /** Emits a structured log line for one tool execution. */
  log(event: ToolExecutionEvent): void;
  /** Emits a structured log line for a request rejected before execute() ran. */
  logInputRejection(event: ToolInputRejectionEvent): void;
};

export type ToolExecutionEvent = {
  sessionId: string;
  projectId: string;
  toolName: string;
  /** True when the output came from the dedup cache instead of a live call. */
  reused: boolean;
  status: "ok" | "error";
  durationMs: number;
};

/** A tool request rejected before execute() ran (Phase V observability). */
export type ToolInputRejectionEvent = {
  /** Tool the model tried to call, when the SDK reported it. */
  toolName: string | null;
  /** SDK error class name ("AI_InvalidToolInputError", …) or code constant. */
  errorClass: string;
};

const DEFAULT_CACHE_CAP = 64;

function cacheKey(toolName: string, args: unknown): CacheKey {
  return `${toolName}:${JSON.stringify(args)}`;
}

export function createToolDedupCache(maxEntries = DEFAULT_CACHE_CAP): {
  get: (key: CacheKey) => unknown;
  set: (key: CacheKey, value: unknown) => void;
} {
  const cache = new Map<CacheKey, unknown>();
  return {
    get(key) {
      return cache.get(key);
    },
    set(key, value) {
      if (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, value);
    },
  };
}

export function createToolExecutionTracker(input: {
  sessionId: string;
  projectId: string;
  maxCacheEntries?: number;
}): ToolExecutionTracker {
  const { get, set } = createToolDedupCache(input.maxCacheEntries);
  return {
    getCached(toolName, args) {
      return get(cacheKey(toolName, args));
    },
    setCached(toolName, args, output) {
      set(cacheKey(toolName, args), output);
    },
    log(event) {
      console.log(
        JSON.stringify({
          type: "sam-tool",
          sessionId: event.sessionId,
          projectId: event.projectId,
          tool: event.toolName,
          reused: event.reused,
          status: event.status,
          durationMs: event.durationMs,
        }),
      );
    },
    logInputRejection(event) {
      // Tool-input rejections never reach the execute() path the sam-tool
      // lines cover, so they get their own event type — same field
      // vocabulary, no raw arguments (they may carry sensitive content).
      // No execution happens, so there is no duration to report.
      console.log(
        JSON.stringify({
          type: "sam-tool-input-error",
          sessionId: input.sessionId,
          projectId: input.projectId,
          tool: event.toolName,
          status: "error",
          errorClass: event.errorClass,
          durationMs: 0,
        }),
      );
    },
  };
}

// A no-op tracker for contexts that don't want dedup/logging (tests, non-SAM
// callers of buildSamMcpTools).
export const nullToolExecutionTracker: ToolExecutionTracker = {
  getCached: () => undefined,
  setCached: () => {},
  log: () => {},
  logInputRejection: () => {},
};
