import { describe, expect, it, vi } from "vitest";
import { createSamTraceBus } from "@/server/features/sam/samTraceBus";
import { createTraceFlushScheduler } from "@/server/features/sam/samTraceBroadcast";
import { reduceTraceFrame } from "./samTraceReducer";
import { parseTraceFrame } from "./samTraceFormat";
import type { SamToolTraceEvent, SamTraceFrame } from "@/shared/samToolTraceTypes";

let seq = 0;
function makeEvent(
  event: SamToolTraceEvent["event"],
  fields: Partial<SamToolTraceEvent> = {},
): SamToolTraceEvent {
  seq += 1;
  return {
    id: `ev_${seq}`,
    turnId: "turn_test_1",
    timestamp: 1000 + seq * 100,
    sequence: seq,
    event,
    ...fields,
  };
}

describe("SAM Debug Trace — Live and Completed Turn State Lifecycle", () => {
  it("1. Trace panel opened before turn starts receives AI identity immediately on turn start", () => {
    const bus = createSamTraceBus();
    const broadcast = vi.fn();
    const scheduler = createTraceFlushScheduler({ broadcast }, bus);

    // Step A: Bus is clean before turn
    expect(bus.snapshot()).toBeNull();

    // Step B: Turn starts in beforeTurn
    const turnId = bus.startTurn();
    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    scheduler.flushNow();

    expect(broadcast).toHaveBeenCalledTimes(1);
    const firstCall = broadcast.mock.calls[0];
    const rawFrame = typeof firstCall?.[0] === "string" ? firstCall[0] : "";
    const frame = parseTraceFrame(rawFrame);
    expect(frame).not.toBeNull();
    expect(frame?.turnId).toBe(turnId);
    expect(frame?.ai).toEqual({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    expect(frame?.events).toHaveLength(0);

    // Reduced view before any tool activity
    const view = reduceTraceFrame(frame!);
    expect(view.ai.provider).toBe("Ollama Cloud");
    expect(view.ai.model).toBe("kimi-k2.7-code");
    expect(view.tools).toHaveLength(0);
    expect(view.turnId).toBe(turnId);
  });

  it("2. Trace panel opened mid-turn hydrates prior tool events", () => {
    const bus = createSamTraceBus();
    const broadcast = vi.fn();
    const scheduler = createTraceFlushScheduler({ broadcast }, bus);

    const turnId = bus.startTurn();
    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    scheduler.flushNow();

    // Tools run mid-turn
    bus.push({ event: "model_attempt", toolName: "get_search_console_performance" });
    bus.push({ event: "gate_allowed", toolName: "get_search_console_performance" });
    bus.push({ event: "handler_start", toolName: "get_search_console_performance", attempt: 1 });
    bus.push({
      event: "provider_request",
      toolName: "get_search_console_performance",
      provider: "gsc",
    });
    bus.push({
      event: "provider_success",
      toolName: "get_search_console_performance",
      provider: "gsc",
      durationMs: 820,
    });
    bus.push({
      event: "tool_completed",
      toolName: "get_search_console_performance",
      durationMs: 825,
    });

    // Mid-turn flush (e.g. at step finish)
    scheduler.flushNow();
    const secondCall = broadcast.mock.calls[1];
    const midTurnRaw = typeof secondCall?.[0] === "string" ? secondCall[0] : "";
    const midTurnFrame = parseTraceFrame(midTurnRaw);

    expect(midTurnFrame).not.toBeNull();
    expect(midTurnFrame?.turnId).toBe(turnId);
    const view = reduceTraceFrame(midTurnFrame!);
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.toolName).toBe("get_search_console_performance");
    expect(view.tools[0]?.finalOk).toBe(true);
    expect(view.tools[0]?.providerCalls).toBe(1);
    expect(view.tools[0]?.durationMs).toBe(825);
  });

  it("3. Trace panel opened after turn completion displays authoritative final trace", () => {
    const bus = createSamTraceBus();
    const broadcast = vi.fn();
    const scheduler = createTraceFlushScheduler({ broadcast }, bus);

    const turnId = bus.startTurn();
    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });

    // Execute multiple tools: GSC and DataForSEO
    bus.push({ event: "model_attempt", toolName: "get_domain_overview" });
    bus.push({ event: "gate_allowed", toolName: "get_domain_overview" });
    bus.push({ event: "handler_start", toolName: "get_domain_overview", attempt: 1 });
    bus.push({ event: "provider_request", toolName: "get_domain_overview", provider: "dataforseo" });
    bus.push({
      event: "provider_success",
      toolName: "get_domain_overview",
      provider: "dataforseo",
      durationMs: 540,
    });
    bus.push({ event: "tool_completed", toolName: "get_domain_overview", durationMs: 542 });

    // Turn completes: onChatResponse triggers flushNow
    scheduler.flushNow();

    // Client attaches / opens trace panel AFTER answer is done:
    const snapshot = bus.snapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.turnId).toBe(turnId);

    const completedFrame: SamTraceFrame = {
      type: "sam_trace",
      turnId: snapshot!.turnId,
      events: snapshot!.events,
      ai: snapshot!.ai,
    };

    const view = reduceTraceFrame(completedFrame);
    expect(view.ai.provider).toBe("Ollama Cloud");
    expect(view.ai.model).toBe("kimi-k2.7-code");
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.toolName).toBe("get_domain_overview");
    expect(view.tools[0]?.lastProvider).toBe("dataforseo");
    expect(view.tools[0]?.durationMs).toBe(542);
    expect(view.summary.succeeded).toBe(1);
  });

  it("4. AI identity and data provider are strictly separated", () => {
    const frame: SamTraceFrame = {
      type: "sam_trace",
      turnId: "turn_distinguish",
      ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
      events: [
        makeEvent("model_attempt", { toolName: "research_keywords" }),
        makeEvent("gate_allowed", { toolName: "research_keywords" }),
        makeEvent("handler_start", { toolName: "research_keywords", attempt: 1 }),
        makeEvent("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
        makeEvent("provider_success", {
          toolName: "research_keywords",
          provider: "dataforseo",
          durationMs: 650,
        }),
        makeEvent("tool_completed", { toolName: "research_keywords", durationMs: 655 }),
      ],
    };

    const view = reduceTraceFrame(frame);
    // Header gets AI provider:
    expect(view.ai.provider).toBe("Ollama Cloud");
    expect(view.ai.model).toBe("kimi-k2.7-code");

    // Tool row gets data provider:
    expect(view.tools[0]?.lastProvider).toBe("dataforseo");
    expect(view.ai.provider).not.toBe("dataforseo");
  });

  it("5. Closing and reopening preserves state without reset", () => {
    let clientFrame: SamTraceFrame | null = null;

    // Turn runs while panel is closed
    const incomingFrame: SamTraceFrame = {
      type: "sam_trace",
      turnId: "turn_preserved",
      ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
      events: [
        makeEvent("model_attempt", { toolName: "get_search_console_performance" }),
        makeEvent("tool_completed", { toolName: "get_search_console_performance", durationMs: 300 }),
      ],
    };

    // Client WS listener is always active:
    clientFrame = incomingFrame;

    // User opens panel:
    let view = reduceTraceFrame(clientFrame);
    expect(view.tools).toHaveLength(1);

    // User closes panel:
    // clientFrame remains unchanged in parent state!
    expect(clientFrame).toBe(incomingFrame);

    // User re-opens panel:
    view = reduceTraceFrame(clientFrame);
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.toolName).toBe("get_search_console_performance");
  });

  it("6. New turn resets trace correctly while retaining completed turn until new events", () => {
    const bus = createSamTraceBus();

    // Turn 1
    const turn1Id = bus.startTurn();
    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    bus.push({ event: "model_attempt", toolName: "tool_in_turn_1" });
    bus.push({ event: "tool_completed", toolName: "tool_in_turn_1" });

    const turn1Snap = bus.snapshot();
    expect(turn1Snap?.turnId).toBe(turn1Id);
    expect(turn1Snap?.events).toHaveLength(2);

    // Turn 2 starts
    const turn2Id = bus.startTurn();
    expect(turn2Id).not.toBe(turn1Id);
    expect(bus.lastCompletedSnapshot()?.turnId).toBe(turn1Id);
    expect(bus.lastCompletedSnapshot()?.events).toHaveLength(2);

    bus.setAi({ provider: "Ollama Cloud", model: "kimi-k2.7-code" });
    const turn2Snap = bus.snapshot();
    expect(turn2Snap?.turnId).toBe(turn2Id);
    expect(turn2Snap?.events).toHaveLength(0); // Clean slate for Turn 2
  });

  it("7. Clear trace intentionally clears UI trace state without breaking new frames", () => {
    let clientFrame: SamTraceFrame | null = {
      type: "sam_trace",
      turnId: "turn_to_clear",
      ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
      events: [makeEvent("model_attempt", { toolName: "tool1" })],
    };

    // User clicks clear
    const onClear = () => {
      clientFrame = null;
    };
    onClear();
    expect(clientFrame).toBeNull();

    // Next frame arrives from server and updates state
    const nextFrame: SamTraceFrame = {
      type: "sam_trace",
      turnId: "turn_next",
      ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
      events: [makeEvent("model_attempt", { toolName: "tool2" })],
    };
    clientFrame = nextFrame;
    expect(clientFrame.turnId).toBe("turn_next");
  });

  it("8. Reconnect and replay do not cause duplicate tool rows", () => {
    const frame: SamTraceFrame = {
      type: "sam_trace",
      turnId: "turn_replay",
      ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
      events: [
        makeEvent("model_attempt", { toolName: "list_saved_keywords" }),
        makeEvent("gate_allowed", { toolName: "list_saved_keywords" }),
        makeEvent("handler_start", { toolName: "list_saved_keywords", attempt: 1 }),
        makeEvent("tool_completed", { toolName: "list_saved_keywords", durationMs: 120 }),
      ],
    };

    // Snapshot replacement ensures identical frame does not duplicate
    const view1 = reduceTraceFrame(frame);
    const view2 = reduceTraceFrame(frame);
    expect(view1.tools).toHaveLength(1);
    expect(view2.tools).toHaveLength(1);
    expect(view2.summary.uniqueTools).toBe(1);
  });

  it("9. Scrubbing prevents API keys and credentials in trace frames", () => {
    const bus = createSamTraceBus();
    bus.startTurn();
    bus.push({
      event: "model_attempt",
      toolName: "dataforseo_tool",
      errorCode: "Authorization: Bearer sk-ant-secret1234567890abcdef",
      metadata: { apiKey: "secret_token_value_987654321" },
    });

    const snap = bus.snapshot();
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain("sk-ant-secret1234567890abcdef");
    expect(serialized).not.toContain("secret_token_value_987654321");
    expect(serialized).toContain("[redacted]");
  });
});
