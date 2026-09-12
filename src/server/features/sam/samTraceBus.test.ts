import { describe, expect, it } from "vitest";

import {
  createSamTraceBus,
  runWithTraceScope,
  MAX_EVENTS_PER_TURN,
} from "./samTraceBus";

// Trace bus unit tests (Phase DT): event model, sanitization, bounding, turn
// scoping — independent of the guarded-runner instrumentation covered in
// samToolTrace.test.ts.

describe("trace bus — event model and hygiene", () => {
  it("emits sanitized events with monotonic sequence inside a turn", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    bus.push({ event: "model_attempt", toolName: "research_keywords" });
    bus.push({ event: "gate_allowed", toolName: "research_keywords" });
    bus.push({ event: "handler_start", toolName: "research_keywords", attempt: 1 });
    const snap = bus.snapshot();
    const seqs = snap?.events.map((e) => e.sequence) ?? [];
    expect(seqs).toEqual([1, 2, 3]);
    expect(snap?.events.every((e) => e.turnId === snap?.turnId)).toBe(true);
  });

  it("scrubs credential-looking material from every string field", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    bus.push({
      event: "model_attempt",
      toolName: "tool",
      errorCode: "Bearer abc123",
      fallbackHint: "sk-mock-dummy-token-sample-value",
      metadata: {
        note: "Authorization: Bearer xyz789",
        nested: "Basic dXNlcjpwYXNz",
      },
    });
    const text = JSON.stringify(bus.snapshot()?.events);
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("sk-mock-dummy-token-sample-value");
    expect(text).not.toContain("Bearer xyz789");
    expect(text).not.toContain("Basic dXNlcjpwYXNz");
    expect(text).toContain("[redacted]");
  });

  it("bounds the turn trace (oldest events dropped past the cap)", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    for (let i = 0; i < MAX_EVENTS_PER_TURN + 50; i++) {
      bus.push({ event: "model_attempt", toolName: `t${i}` });
    }
    const events = bus.snapshot()?.events ?? [];
    expect(events.length).toBe(MAX_EVENTS_PER_TURN);
    // Newest kept, oldest dropped.
    expect(events[events.length - 1]?.toolName).toBe(
      `t${MAX_EVENTS_PER_TURN + 49}`,
    );
  });

  it("a new turn resets events and mints a fresh turn id", () => {
    const bus = createSamTraceBus();
    const first = bus.startTurn();
    bus.push({ event: "model_attempt", toolName: "a" });
    const second = bus.startTurn();
    expect(second).not.toBe(first);
    expect(bus.snapshot()?.events).toHaveLength(0);
  });

  it("push outside a turn is a no-op (non-SAM callers unaffected)", () => {
    const bus = createSamTraceBus();
    bus.clear();
    expect(bus.push({ event: "model_attempt", toolName: "x" })).toBeNull();
    expect(bus.snapshot()).toBeNull();
    expect(bus.currentTurnId()).toBeNull();
  });

  it("runWithTraceScope attributes ambient tool/attempt to nested emissions", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    runWithTraceScope(
      {
        turnId: bus.currentTurnId() ?? "",
        toolName: "get_serp_results",
        attempt: 2,
      },
      () => {
        bus.push({ event: "provider_request", provider: "dataforseo" });
      },
    );
    const event = bus.snapshot()?.events[0];
    expect(event?.toolName).toBe("get_serp_results");
    expect(event?.attempt).toBe(2);
  });

  it("setAi updates the turn's AI identity (scrubbed)", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    expect(bus.snapshot()?.ai).toEqual({
      provider: "Ollama Cloud",
      model: "kimi-k2.7-code",
    });
  });
});
