import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  buildRenderPlan,
  groupConsecutiveToolParts,
  toolPartOutput,
  type ChatToolPart,
} from "./toolParts";

type Part = UIMessage["parts"][number];

function toolPart(
  type: `tool-${string}`,
  overrides: Record<string, unknown> = {},
): ChatToolPart {
  return {
    type,
    toolCallId: "t1",
    state: "output-available",
    input: {},
    output: { ok: true },
    ...overrides,
  };
}

const textPart = (text: string): Part => ({ type: "text", text });
const reasoningPart = (text: string): Part => ({ type: "reasoning", text });

describe("groupConsecutiveToolParts", () => {
  it("merges a run of identical consecutive tool parts, keeping the last", () => {
    const groups = groupConsecutiveToolParts([
      toolPart("tool-get_audit_status"),
      toolPart("tool-get_audit_status"),
      toolPart("tool-get_audit_status", { output: { ok: false } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].parts).toHaveLength(3);
    expect(groups[0].last).toBe(groups[0].parts[2]);
    expect(toolPartOutput(groups[0].last)).toEqual({ ok: false });
  });

  it("keeps non-consecutive same-type calls separate", () => {
    const groups = groupConsecutiveToolParts([
      toolPart("tool-run_site_audit"),
      toolPart("tool-poll_site_audit"),
      toolPart("tool-run_site_audit"),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      "tool-run_site_audit",
      "tool-poll_site_audit",
      "tool-run_site_audit",
    ]);
    for (const group of groups) expect(group.parts).toHaveLength(1);
  });

  it("returns an empty list for messages without tool parts", () => {
    expect(groupConsecutiveToolParts([textPart("hi")])).toEqual([]);
    expect(groupConsecutiveToolParts([])).toEqual([]);
  });
});

describe("buildRenderPlan", () => {
  it("preserves document order while collapsing poll runs in place", () => {
    const plan = buildRenderPlan([
      reasoningPart("thinking"),
      textPart("Starting an audit."),
      toolPart("tool-run_site_audit"),
      toolPart("tool-poll_site_audit"),
      toolPart("tool-poll_site_audit"),
      toolPart("tool-poll_site_audit"),
      textPart("Here is your report…"),
      toolPart("tool-get_audit_issues"),
    ]);
    const kinds = plan.map((entry) =>
      entry.kind === "tools"
        ? `tools:${entry.group.type}×${entry.group.parts.length}`
        : entry.part.type,
    );
    expect(kinds).toEqual([
      "reasoning",
      "text",
      "tools:tool-run_site_audit×1",
      "tools:tool-poll_site_audit×3",
      "text",
      "tools:tool-get_audit_issues×1",
    ]);
  });

  it("passes through non-tool parts untouched", () => {
    const plan = buildRenderPlan([textPart("a"), reasoningPart("b")]);
    expect(plan).toHaveLength(2);
    expect(plan.every((entry) => entry.kind === "part")).toBe(true);
  });

  it("never crashes on malformed part arrays from failed provider turns", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- malformed-shape fixture: the whole point is invalid entries
    const malformed = [
      null,
      textPart("partial answer"),
      undefined,
      toolPart("tool-get_audit_status"),
      42,
    ] as unknown as UIMessage["parts"];
    expect(() => groupConsecutiveToolParts(malformed)).not.toThrow();
    expect(() => buildRenderPlan(malformed)).not.toThrow();
    const plan = buildRenderPlan(malformed);
    // Only well-formed entries survive; order preserved among them.
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ kind: "part" });
    expect(plan[1]).toMatchObject({ kind: "tools" });
  });
});
