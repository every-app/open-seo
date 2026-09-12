// Debug Trace broadcast scheduling for SamChatAgent (Phase DT).
//
// Extracted from SamChatAgent to keep the DO file within lint budgets. The
// scheduler coalesces trace emissions into bounded wire flushes: trace events
// fire per provider call (potentially many per second), but each flush sends
// the FULL current-turn snapshot — so more frequent flushing only duplicates
// data. 250ms cadence matches the panel's perceivable liveness without
// per-event churn (the same discipline as the chat stream's 100ms throttle).

import type { Connection, WSMessage } from "agents";
import type { SamTraceFrame } from "@/shared/samToolTraceTypes";
import { getSamTraceBus, type SamTraceBus } from "@/server/features/sam/samTraceBus";

/** The DO broadcasts to its WebSocket connections via this shape. */
export type TraceBroadcaster = {
  broadcast: (message: string) => void;
};

const FLUSH_DELAY_MS = 250;

export type TraceFlushScheduler = {
  /** Request a flush soon (coalesced). */
  request(): void;
  /** Flush current snapshot immediately without delay. */
  flushNow(): void;
  /** Stop the scheduler (DO eviction hygiene). */
  dispose(): void;
};

/**
 * Create a coalescing flush scheduler bound to a DO-like broadcaster.
 * Flushes carry the current snapshot; failures are swallowed (traces are
 * best-effort observability and must never fail a turn).
 */
export function createTraceFlushScheduler(
  broadcaster: TraceBroadcaster,
  bus: SamTraceBus = getSamTraceBus(),
): TraceFlushScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    dirty = false;
    const snap = bus.snapshot();
    if (!snap) return;
    const frame: SamTraceFrame = {
      type: "sam_trace",
      turnId: snap.turnId,
      events: snap.events,
      ai: snap.ai,
    };
    try {
      broadcaster.broadcast(JSON.stringify(frame));
    } catch {
      // Hibernating DO / no connections — the trace is ephemeral by design.
    }
  };

  return {
    request() {
      dirty = true;
      if (timer === null) {
        timer = setTimeout(flush, FLUSH_DELAY_MS);
      }
    },
    flushNow() {
      dirty = true;
      flush();
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      dirty = false;
    },
  };
}

/**
 * Handle HTTP GET /trace requests for trace hydration.
 */
export function handleTraceHttpRequest(
  request: Request,
  bus: SamTraceBus = getSamTraceBus(),
): Response | null {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/trace")) {
      const snap = bus.snapshot();
      if (snap) {
        const frame: SamTraceFrame = {
          type: "sam_trace",
          turnId: snap.turnId,
          events: snap.events,
          ai: snap.ai,
        };
        return Response.json(frame);
      }
      return Response.json(null);
    }
  }
  return null;
}

/**
 * Handle WebSocket messages requesting an immediate trace snapshot.
 * Returns true if the message was handled as a trace request.
 */
export function handleTraceWebSocketMessage(
  connection: Connection,
  message: WSMessage,
  bus: SamTraceBus = getSamTraceBus(),
): boolean {
  if (typeof message === "string") {
    try {
      const parsed: unknown = JSON.parse(message);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        parsed.type === "sam_trace_request"
      ) {
        const snap = bus.snapshot();
        if (snap) {
          const frame: SamTraceFrame = {
            type: "sam_trace",
            turnId: snap.turnId,
            events: snap.events,
            ai: snap.ai,
          };
          connection.send(JSON.stringify(frame));
        }
        return true;
      }
    } catch {
      // Non-JSON message
    }
  }
  return false;
}

/**
 * Send the current trace snapshot on new connection attach if available.
 */
export function sendTraceSnapshotOnConnect(
  connection: Connection,
  bus: SamTraceBus = getSamTraceBus(),
): void {
  const snap = bus.snapshot();
  if (snap && (snap.events.length > 0 || snap.ai.provider)) {
    const frame: SamTraceFrame = {
      type: "sam_trace",
      turnId: snap.turnId,
      events: snap.events,
      ai: snap.ai,
    };
    try {
      connection.send(JSON.stringify(frame));
    } catch {
      // Connection closed
    }
  }
}
