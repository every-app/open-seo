// Server-side SAM trace bus (Phase DT).
//
// One in-memory, per-DO store of normalized trace events for the CURRENT
// user turn. Instrumentation seams (guarded tool runner, recovery gate,
// DataRouter) push events here; SamChatAgent broadcasts snapshots to the
// connected client after each flush. The store is intentionally not a
// database: traces are ephemeral observability data bounded per turn.
//
// DESIGN NOTES:
// - Lazy module-level singleton per isolate: the SAM chat DO is one DO per
//   session, so at most one conversation writes into it at a time. Tests
//   create their own instances / reset the singleton.
// - Bounded: MAX_EVENTS_PER_TURN caps memory; pushing past the cap drops the
//   OLDEST events (keeps the newest, which carry the final states).
// - The AsyncLocalStorage scope: like the MCP auth context, the trace "turn"
//   is ambient so deep seams (DataRouter, provider adapters) can emit without
//   threading a context object through every signature. The tool name rides
//   the same ambient scope — one tool executes at a time within a turn
//   handler (Think runs tools concurrently in theory; when tools overlap we
//   attribute each event to the innermost scope, which is correct because the
//   scope is established inside executeAdaptedTool).
// - Sanitization: push() scrubs known credential shapes and enforces the
//   event vocabulary. Emitters pass already-normalized values (error codes,
//   status numbers) — never raw provider payloads.

import {
  scrubTraceText,
  type SamToolTraceEvent,
  type SamToolTraceEventName,
} from "@/shared/samToolTraceTypes";
import { AsyncLocalStorage } from "node:async_hooks";

/** Events kept per turn — a 30-tool turn with retries stays well under this. */
export const MAX_EVENTS_PER_TURN = 500;

type TraceScope = {
  turnId: string;
  toolName: string;
  attempt: number;
};

const traceScopeStorage = new AsyncLocalStorage<TraceScope>();

export type SamTraceTurn = {
  turnId: string;
  events: SamToolTraceEvent[];
  /** Set when the turn's provider config resolved; drives the AI header. */
  ai: { provider: string; model: string | null };
  startedAt: number;
};

export type SamTraceBus = {
  /** Begin a new turn: resets events, mints a turn id. */
  startTurn(input?: { ai?: { provider: string; model: string | null } }): string;
  /** Update the effective AI provider/model after config resolution. */
  setAi(ai: { provider: string; model: string | null }): void;
  /** Append one event to the current turn (no-op outside a turn). */
  push(event: SamTraceBusEvent): SamToolTraceEvent | null;
  /** Current turn id (null when no turn ever started). */
  currentTurnId(): string | null;
  /** Snapshot of the current turn's events (bounded, sanitized). */
  snapshot(): SamTraceTurn | null;
  /** Snapshot of the last completed turn, if any. */
  lastCompletedSnapshot(): SamTraceTurn | null;
  /** Clear all trace state (visual reset + memory hygiene). */
  clear(): void;
};

export type SamTraceBusEvent = {
  event: SamToolTraceEventName;
  toolName?: string;
  provider?: string;
  attempt?: number;
  errorCode?: string;
  httpStatus?: number;
  retryAllowed?: boolean;
  blocked?: boolean;
  durationMs?: number;
  cacheHit?: boolean;
  cacheWrite?: boolean;
  fallbackHint?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Create an independent trace bus (tests, non-DO contexts).
 */
export function createSamTraceBus(): SamTraceBus {
  let current: SamTraceTurn | null = null;
  let lastCompleted: SamTraceTurn | null = null;
  let sequence = 0;

  const push = (input: SamTraceBusEvent): SamToolTraceEvent | null => {
    if (!current) return null;
    sequence += 1;
    const scope = traceScopeStorage.getStore();
    const event: SamToolTraceEvent = {
      id: `ev_${sequence}_${Math.random().toString(36).slice(2, 8)}`,
      turnId: current.turnId,
      timestamp: Date.now(),
      sequence,
      event: input.event,
      toolName: scrub(input.toolName ?? scope?.toolName),
      provider: scrub(input.provider),
      attempt: input.attempt ?? scope?.attempt,
      errorCode: input.errorCode === undefined ? undefined : scrub(input.errorCode),
      httpStatus: input.httpStatus,
      retryAllowed: input.retryAllowed,
      blocked: input.blocked,
      durationMs: input.durationMs,
      cacheHit: input.cacheHit,
      cacheWrite: input.cacheWrite,
      fallbackHint: input.fallbackHint === undefined ? undefined : scrub(input.fallbackHint),
      metadata: scrubMetadata(input.metadata),
    };
    current.events.push(event);
    if (current.events.length > MAX_EVENTS_PER_TURN) {
      current.events.splice(0, current.events.length - MAX_EVENTS_PER_TURN);
    }
    return event;
  };

  return {
    startTurn(input) {
      if (current && (current.events.length > 0 || current.ai.provider)) {
        lastCompleted = {
          turnId: current.turnId,
          events: current.events.slice(),
          ai: current.ai,
          startedAt: current.startedAt,
        };
      }
      sequence = 0;
      const turnId = `turn_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      current = {
        turnId,
        events: [],
        ai: input?.ai ?? { provider: "", model: null },
        startedAt: Date.now(),
      };
      return turnId;
    },
    setAi(ai) {
      if (current) {
        current.ai = {
          provider: scrub(ai.provider) ?? "",
          model: ai.model === null ? null : (scrub(ai.model) ?? null),
        };
      }
    },
    push,
    currentTurnId() {
      return current?.turnId ?? null;
    },
    snapshot() {
      if (!current) {
        if (!lastCompleted) return null;
        return {
          turnId: lastCompleted.turnId,
          events: lastCompleted.events.slice(),
          ai: lastCompleted.ai,
          startedAt: lastCompleted.startedAt,
        };
      }
      return {
        turnId: current.turnId,
        events: current.events.slice(),
        ai: current.ai,
        startedAt: current.startedAt,
      };
    },
    lastCompletedSnapshot() {
      if (!lastCompleted) return null;
      return {
        turnId: lastCompleted.turnId,
        events: lastCompleted.events.slice(),
        ai: lastCompleted.ai,
        startedAt: lastCompleted.startedAt,
      };
    },
    clear() {
      current = null;
      lastCompleted = null;
      sequence = 0;
    },
  };
}

/** Scrub one string with the shared credential-pattern scrubber. */
function scrub(value: string | undefined): string | undefined {
  return value === undefined ? undefined : scrubTraceText(value);
}

/** Scrub metadata values (string leaves only; other types pass through). */
function scrubMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const scrubbedKey = scrubTraceText(key);
    if (/^(?:api[-_]?key|authorization|token|secret|password)$/i.test(key)) {
      out[scrubbedKey] = "[redacted]";
    } else {
      out[scrubbedKey] =
        typeof value === "string" ? scrubTraceText(value) : value;
    }
  }
  return out;
}

/**
 * Run `callback` with an ambient trace scope so nested seams (DataRouter,
 * providers) attribute their events to the current tool + attempt without
 * explicit plumbing. Pure pass-through of the callback's return value.
 */
export function runWithTraceScope<T>(
  scope: TraceScope,
  callback: () => T,
): T {
  return traceScopeStorage.run(scope, callback);
}

/** Read the ambient tool/attempt scope (null outside a traced execution). */
export function currentTraceScope(): TraceScope | null {
  return traceScopeStorage.getStore() ?? null;
}

// ---------------------------------------------------------------------------
// Direct provider-call helpers (non-router paths)
// ---------------------------------------------------------------------------

/**
 * Wrap one DIRECT provider network call (bypassing the DataRouter — e.g.
 * GSC's own API client) with provider_request/success/error trace events.
 * Transparent pass-through; no-op outside a SAM turn.
 */
export async function traceDirectProviderCall<T>(
  provider: string,
  execute: () => Promise<T>,
): Promise<T> {
  const bus = getSamTraceBus();
  if (!bus.currentTurnId()) return execute();
  const startedAt = Date.now();
  bus.push({ event: "provider_request", provider });
  try {
    const data = await execute();
    bus.push({
      event: "provider_success",
      provider,
      durationMs: Date.now() - startedAt,
    });
    return data;
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status: unknown }).status
        : undefined;
    bus.push({
      event: "provider_error",
      provider,
      errorCode:
        typeof error === "object" && error !== null && "name" in error
          ? String((error as { name: unknown }).name)
          : "UNKNOWN",
      httpStatus: typeof status === "number" ? status : undefined,
    });
    throw error;
  }
}

/** GSC-specific alias: names the provider identity for the trace panel. */
export function traceGscCall<T>(execute: () => Promise<T>): Promise<T> {
  return traceDirectProviderCall("gsc", execute);
}

// ---------------------------------------------------------------------------
// Singleton for the SAM chat DO (one isolate serves one session's DO class;
// each DO instance writes only its own turns — see SamChatAgent wiring, which
// starts a fresh turn in beforeTurn, so interleaved sessions never mix).
// ---------------------------------------------------------------------------

let singleton: SamTraceBus | null = null;

/** The process-wide bus used by the SAM chat agent. */
export function getSamTraceBus(): SamTraceBus {
  return (singleton ??= createSamTraceBus());
}

/** Test-only: drop the singleton so tests start clean. */
export function resetSamTraceBus(): void {
  singleton = null;
}
