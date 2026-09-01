import { describe, expect, it } from "vitest";
import { chatMessagePropsEqualForTest as equal } from "./ChatMessage";
import { humanizeToolLabel } from "./ChatMessage";
import type { UIMessage } from "ai";

function assistant(id: string, parts: UIMessage["parts"]): UIMessage {
  return { id, role: "assistant", parts };
}
const labels = humanizeToolLabel("x");
const onUndo = () => {};
const onEdit = (_t: string) => {};

describe("ChatMessage memo comparator", () => {
  it("bails out when nothing changed (all references equal)", () => {
    const m = assistant("a", [{ type: "text", text: "hi" }]);
    expect(
      equal(
        { message: m, streaming: false, resolveToolLabel: labels },
        { message: m, streaming: false, resolveToolLabel: labels },
      ),
    ).toBe(true);
  });

  it("bails out for a static message while another message streams (only handler identities churn)", () => {
    // The parent re-creates undo/edit closures every render; a settled user
    // message must not re-render because of that.
    const m = { id: "u1", role: "user", parts: [{ type: "text" as const, text: "q" }] };
    expect(
      equal(
        { message: m, streaming: false, resolveToolLabel: labels, onUndo, onEdit },
        { message: m, streaming: false, resolveToolLabel: labels, onUndo: () => {}, onEdit: (t: string) => t },
      ),
    ).toBe(true);
  });

  it("re-renders when the message object is replaced (streaming clone, same id)", () => {
    // The store clones the streamed message on every chunk: new reference,
    // same id. Content changed → must re-render.
    const before = assistant("a", [{ type: "text", text: "hello" }]);
    const after = assistant("a", [{ type: "text", text: "hello world" }]);
    expect(
      equal(
        { message: before, streaming: true, resolveToolLabel: labels },
        { message: after, streaming: true, resolveToolLabel: labels },
      ),
    ).toBe(false);
  });

  it("re-renders when a tool part is added or its state changes (message replaced)", () => {
    const before = assistant("a", [{ type: "text", text: "running…" }]);
    const after = assistant("a", [
      { type: "text", text: "running…" },
      {
        type: "tool-get_domain_overview",
        toolCallId: "t1",
        state: "output-available",
        input: {},
        output: { ok: true },
      },
    ]);
    expect(
      equal(
        { message: before, streaming: true, resolveToolLabel: labels },
        { message: after, streaming: true, resolveToolLabel: labels },
      ),
    ).toBe(false);
  });

  it("re-renders when streaming flips (live → settled)", () => {
    const m = assistant("a", [{ type: "text", text: "done" }]);
    expect(
      equal(
        { message: m, streaming: true, resolveToolLabel: labels },
        { message: m, streaming: false, resolveToolLabel: labels },
      ),
    ).toBe(false);
  });

  it("re-renders when the label resolver changes (chat-level remount semantics)", () => {
    const m = assistant("a", []);
    expect(
      equal(
        { message: m, resolveToolLabel: labels },
        { message: m, resolveToolLabel: humanizeToolLabel("y") },
      ),
    ).toBe(false);
  });

  it("re-renders when the handler wiring appears or disappears for the same message", () => {
    const m = { id: "u1", role: "user", parts: [{ type: "text" as const, text: "q" }] };
    // onUndo provided before, absent next (e.g. edit permissions changed).
    expect(
      equal(
        { message: m, onUndo, resolveToolLabel: labels },
        { message: m, resolveToolLabel: labels },
      ),
    ).toBe(false);
  });
});