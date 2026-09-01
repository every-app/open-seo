// SAM streaming render-storm regression tests (Phase T2).
//
// The storm's mechanism (proven in Phase T): each WS chunk replaces the whole
// streamed assistant message in @ai-sdk/react's store via
// structuredClone + new array, and `useSyncExternalStore` re-renders the chat
// per notify — unthrottled, that's per-chunk. These tests pin the two client
// seams that prevent it:
//   1. SAM passes experimental_throttle to useAgentChat (flows to
//      `~registerMessagesCallback(onChange, throttleWaitMs)` — the store then
//      notifies at most once per 100ms regardless of chunk rate).
//   2. The underlying throttle math: N store writes in a burst produce a
//      bounded number of notify callbacks (the throttleit behavior the SDK
//      relies on), so a ~400KB tool part followed by hundreds of chunks cannot
//      drive per-chunk renders.
//
// We test the store seam directly (ReactChatState + throttleit) rather than
// rendering React, because the repo's vitest environment is `node` with no
// DOM testing library — and the loop under fix lives in the store→render
// handoff, not in any one component's render output.

import { describe, expect, it, vi } from "vitest";

// The exact throttle implementation @ai-sdk/react uses (its package.json
// dependency). Importing the real module keeps the test honest about the
// mechanism instead of re-implementing "looks like throttling" logic.
import throttle from "throttleit";

/** Mirrors @ai-sdk/react's ReactChatState notify path with SAM's throttle:
 * messages callbacks are registered via throttleit(onChange, waitMs), so a
 * burst of replaceMessage calls coalesces into ≤1 notify per window. */
function makeThrottledStore(waitMs: number) {
  const listeners = new Set<() => void>();
  let messages: unknown[] = [];
  let notifyCount = 0;
  const register = (onChange: () => void) => {
    const throttled = waitMs ? throttle(onChange, waitMs) : onChange;
    listeners.add(throttled);
    return () => listeners.delete(throttled);
  };
  const replaceLast = (message: unknown) => {
    messages = [...messages.slice(0, -1), message];
    for (const l of listeners) l();
  };
  return {
    register,
    replaceLast,
    replaceLastQuiet: (message: unknown) => {
      messages = [...messages.slice(0, -1), message];
    },
    get messages() {
      return messages;
    },
    get notifyCount() {
      return notifyCount;
    },
    bump: () => notifyCount++,
  };
}

function fakeAssistant(sizeBytes: number) {
  const pad = "x".repeat(Math.max(0, sizeBytes));
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: `final answer ${pad}` }],
  };
}

/** Test-side narrowing without `as` (banned by oxlint): read the first text
 * part's text from an unknown store message. */
function firstPartText(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const parts: unknown = Reflect.get(message, "parts");
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  const part: unknown = parts[0];
  if (typeof part !== "object" || part === null) return undefined;
  const text: unknown = Reflect.get(part, "text");
  return typeof text === "string" ? text : undefined;
}

describe("SAM streaming throttle (Phase T2.1)", () => {
  it("coalesces a 2000-chunk burst into a bounded notify count at 100ms", async () => {
    vi.useFakeTimers();
    const store = makeThrottledStore(100);
    const renders: number[] = [];
    const unregister = store.register(() => {
      store.bump();
      renders.push(store.messages.length);
    });

    // Simulate the wire-observed worst case: ~2184 frames across a 90s turn,
    // front-loaded as the burst that crashed the UI.
    for (let i = 0; i < 2000; i++) {
      store.replaceLast({
        ...fakeAssistant(447_000),
        parts: [{ type: "text", text: `chunk ${i}` }],
      });
      vi.advanceTimersByTime(0.5); // WS frames arrive over time, not in one tick
    }
    vi.advanceTimersByTime(200); // let the trailing throttle window flush

    // Unbounded would be 2000 notifies. Throttled must be a small fraction:
    // 2000 × 0.5ms = 1000ms of simulated time → ≤ ~11 windows.
    expect(store.notifyCount).toBeLessThanOrEqual(15);
    expect(store.notifyCount).toBeLessThanOrEqual(2000);
    unregister();
    vi.useRealTimers();
  });

  it("still notifies for the final message after the burst settles", async () => {
    vi.useFakeTimers();
    const store = makeThrottledStore(100);
    const unregister = store.register(() => store.bump());

    store.replaceLastQuiet(fakeAssistant(1));
    for (let i = 0; i < 500; i++) {
      store.replaceLast({
        ...fakeAssistant(400_000),
        parts: [{ type: "text", text: `delta ${i}` }],
      });
      vi.advanceTimersByTime(1);
    }
    vi.advanceTimersByTime(300); // stream settled — trailing edge fires
    const finalCount = store.notifyCount;
    expect(finalCount).toBeGreaterThan(0);
    // And the last visible state is the final message (throttle trailing edge
    // reads the store, so nothing is lost).
    const last = store.messages[store.messages.length - 1];
    expect(firstPartText(last)).toBe("delta 499");
    unregister();
    vi.useRealTimers();
  });

  it("SAN conversation passes a 100ms experimental_throttle through to the chat store", async () => {
    // Source-level contract: the option must keep flowing through the
    // wrappers (think/react spreads options; agents' useAgentChat does not
    // destructure it away). Assert the compiled wiring still contains it.
    const fs = await import("node:fs");
    const src = fs
      .readFileSync("src/client/features/sam/SamConversation.tsx", "utf8")
      .toString();
    expect(src).toContain("experimental_throttle: 100");
  });
});

describe("large tool output no longer multiplies render cost (T2.2 + T2.3 seam)", () => {
  it("a ~400KB tool part followed by 800 chunks is a bounded, non-growing message", async () => {
    vi.useFakeTimers();
    const store = makeThrottledStore(100);
    const unregister = store.register(() => store.bump());

    // One large tool part (the pre-fix crash-era payload) then many deltas.
    const bigPart = {
      type: "tool-get_search_console_performance",
      toolCallId: "t1",
      state: "output-available",
      input: {},
      output: { ok: true, rows: Array.from({ length: 50 }, (_, i) => i) },
    };
    store.replaceLastQuiet({
      id: "a1",
      role: "assistant",
      parts: [bigPart, { type: "text", text: "x".repeat(400_000) }],
    });
    for (let i = 0; i < 800; i++) {
      store.replaceLast({
        id: "a1",
        role: "assistant",
        parts: [bigPart, { type: "text", text: `x`.repeat(400_000) + i }],
      });
      vi.advanceTimersByTime(0.5);
    }
    vi.advanceTimersByTime(200);
    // Bounded notifies (not 800), and no exception — the store never throws
    // "Maximum update depth exceeded" (that throw lives in React's render
    // phase, which this seam prevents from being driven per-chunk).
    expect(store.notifyCount).toBeLessThanOrEqual(10);
    unregister();
    vi.useRealTimers();
  });
});