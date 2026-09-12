import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  buildRenderPlan,
  getToolFailureDetail,
  getToolPartName,
  getToolPartType,
  groupConsecutiveToolParts,
  isBlockedToolPart,
  isToolPart,
  isToolPartFailed,
  toolPartOutput,
  type ChatToolPart,
} from "./toolParts";
import { messageHasVisibleContent } from "./ChatMessage";

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

function dynamicToolPart(
  toolName: string,
  overrides: Record<string, unknown> = {},
): ChatToolPart {
  return {
    type: "dynamic-tool",
    toolName,
    toolCallId: `t_${toolName}`,
    state: "output-available",
    input: {},
    output: { ok: true },
    ...overrides,
  } as ChatToolPart;
}

const textPart = (text: string): Part => ({ type: "text", text });
const reasoningPart = (text: string): Part => ({ type: "reasoning", text });

describe("isToolPart and normalization helpers", () => {
  it("identifies both tool-* and dynamic-tool parts", () => {
    expect(isToolPart(toolPart("tool-get_serp_results"))).toBe(true);
    expect(isToolPart(dynamicToolPart("get_serp_results"))).toBe(true);
    expect(isToolPart(textPart("hello"))).toBe(false);
    expect(isToolPart(reasoningPart("thought"))).toBe(false);
  });

  it("normalizes tool types and bare names consistently", () => {
    const staticPart = toolPart("tool-research_keywords");
    const dynamicPart = dynamicToolPart("research_keywords");

    expect(getToolPartType(staticPart)).toBe("tool-research_keywords");
    expect(getToolPartType(dynamicPart)).toBe("tool-research_keywords");

    expect(getToolPartName(staticPart)).toBe("research_keywords");
    expect(getToolPartName(dynamicPart)).toBe("research_keywords");
  });
});

describe("isBlockedToolPart and isToolPartFailed", () => {
  it("detects recovery-blocked internal retries", () => {
    const blockedExplicit = toolPart("tool-research_keywords", {
      output: {
        recoveryBlocked: true,
        error: 'Tool "research_keywords" is unavailable for this turn because...',
      },
    });
    const blockedByText = toolPart("tool-research_keywords", {
      output: {
        error: 'Tool "research_keywords" is unavailable for this turn. Do not retry.',
      },
    });
    const normalSuccess = toolPart("tool-research_keywords", {
      output: { ok: true, results: [] },
    });
    const siteScrapeBlocked = toolPart("tool-map_links", {
      output: { blocked: true, urls: [], note: "Could not reach site" },
    });

    expect(isBlockedToolPart(blockedExplicit)).toBe(true);
    expect(isBlockedToolPart(blockedByText)).toBe(true);
    expect(isBlockedToolPart(normalSuccess)).toBe(false);
    expect(isBlockedToolPart(siteScrapeBlocked)).toBe(false);
  });

  it("detects tool failures and formats user-friendly failure details", () => {
    const creditFailure = toolPart("tool-research_keywords", {
      output: {
        error: 'Tool "research_keywords" failed: credits unavailable — it is now unavailable for this turn.',
        recoveryNotice: 'credits unavailable',
      },
    });
    const rateLimitFailure = toolPart("tool-get_keyword_metrics", {
      output: {
        error: 'Tool "get_keyword_metrics" was rate-limited. One automatic retry is allowed...',
      },
    });
    const inputFailure = toolPart("tool-save_keywords", {
      output: {
        error: "Invalid tool arguments for save_keywords.",
      },
    });

    expect(isToolPartFailed(creditFailure)).toBe(true);
    expect(getToolFailureDetail(creditFailure)).toBe("Credits unavailable — using fallback");

    expect(isToolPartFailed(rateLimitFailure)).toBe(true);
    expect(getToolFailureDetail(rateLimitFailure)).toBe("Rate limited — using fallback");

    expect(isToolPartFailed(inputFailure)).toBe(true);
    expect(getToolFailureDetail(inputFailure)).toBe("Invalid arguments");
  });
});

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

  it("groups dynamic-tool parts by their normalized tool type", () => {
    const groups = groupConsecutiveToolParts([
      dynamicToolPart("get_search_console_performance"),
      dynamicToolPart("get_search_console_performance"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("tool-get_search_console_performance");
    expect(groups[0].parts).toHaveLength(2);
  });

  it("does not increment count for blocked internal retries", () => {
    const groups = groupConsecutiveToolParts([
      toolPart("tool-research_keywords", {
        output: { error: "credits unavailable" },
      }),
      toolPart("tool-research_keywords", {
        output: { recoveryBlocked: true, error: "unavailable for this turn" },
      }),
      toolPart("tool-research_keywords", {
        output: { recoveryBlocked: true, error: "unavailable for this turn" },
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].parts).toHaveLength(1);
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

  it("renders the canonical multi-tool turn in exact chronological order without blocked duplicates", () => {
    // Exact sequence described in UX requirements:
    // 1. Get search console performance ×2
    // 2. List saved keywords
    // 3. Get domain overview
    // 4. Issues checked (get_audit_issues)
    // 5. Get keyword metrics
    // 6. Research keywords (failed with 402, followed by blocked retries)
    // 7. Get SERP results
    // 8. Save keywords
    // 9. Set context
    const turnParts: Part[] = [
      reasoningPart("Analyzing organic growth opportunities..."),
      toolPart("tool-get_search_console_performance"),
      toolPart("tool-get_search_console_performance"),
      toolPart("tool-list_saved_keywords"),
      toolPart("tool-get_domain_overview"),
      toolPart("tool-get_audit_issues"),
      toolPart("tool-get_keyword_metrics"),
      toolPart("tool-research_keywords", {
        output: {
          error: 'Tool "research_keywords" failed: credits unavailable — it is now unavailable for this turn.',
          recoveryNotice: 'credits unavailable',
        },
      }),
      reasoningPart("Research failed, trying again..."),
      toolPart("tool-research_keywords", {
        output: {
          recoveryBlocked: true,
          error: 'Tool "research_keywords" is unavailable for this turn because the previous attempt failed with CREDITS_UNAVAILABLE. Do not retry.',
        },
      }),
      reasoningPart("Still blocked, falling back to SERP..."),
      toolPart("tool-research_keywords", {
        output: {
          recoveryBlocked: true,
          error: 'Tool "research_keywords" is unavailable for this turn...',
        },
      }),
      toolPart("tool-get_serp_results"),
      toolPart("tool-save_keywords"),
      toolPart("tool-set_context"),
      textPart("Here are your organic growth opportunities..."),
    ];

    const plan = buildRenderPlan(turnParts);

    const summaries = plan.map((entry) => {
      if (entry.kind === "part") return entry.part.type;
      return `${entry.group.type}×${entry.group.parts.length}`;
    });

    expect(summaries).toEqual([
      "reasoning",
      "tool-get_search_console_performance×2",
      "tool-list_saved_keywords×1",
      "tool-get_domain_overview×1",
      "tool-get_audit_issues×1",
      "tool-get_keyword_metrics×1",
      "tool-research_keywords×1", // Only 1 badge, NOT 3 badges, NOT ×3 count!
      "reasoning",
      "reasoning",
      "tool-get_serp_results×1",
      "tool-save_keywords×1",
      "tool-set_context×1",
      "text",
    ]);

    // Check that the research_keywords entry has the failure state and detail
    const rkEntry = plan.find(
      (e) => e.kind === "tools" && e.group.type === "tool-research_keywords",
    );
    expect(rkEntry).toBeDefined();
    if (rkEntry && rkEntry.kind === "tools") {
      expect(isToolPartFailed(rkEntry.group.last)).toBe(true);
      expect(getToolFailureDetail(rkEntry.group.last)).toBe(
        "Credits unavailable — using fallback",
      );
    }
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

  it("emits a defined group for every tools entry when the same tool type recurs after a non-tool part", () => {
    const plan = buildRenderPlan([
      toolPart("tool-get_search_console_performance"),
      reasoningPart("thinking between calls"),
      toolPart("tool-get_search_console_performance"),
    ]);
    const toolsEntries = plan.filter(
      (entry): entry is Extract<(typeof plan)[number], { kind: "tools" }> =>
        entry.kind === "tools",
    );
    expect(toolsEntries).toHaveLength(2); // document order: two distinct calls
    for (const entry of toolsEntries) {
      expect(entry.group).toBeDefined();
      expect(typeof entry.group.type).toBe("string");
      expect(entry.group.parts).toHaveLength(1);
    }
  });

  it("never emits an undefined group for any same-type-recurs sequence (exhaustive short alphabet)", () => {
    const filler = [textPart("x"), reasoningPart("y")];
    const alphabet: Array<Part | undefined> = [
      toolPart("tool-a"),
      toolPart("tool-b"),
      ...filler,
      undefined, // marks "sequence ends here"
    ];
    const seqs: Array<Part[]> = [];
    const pushSeq = (parts: Array<Part | undefined>) => {
      const seq: Part[] = [];
      for (const p of parts) {
        if (p === undefined) break;
        seq.push(p);
      }
      seqs.push(seq);
    };
    for (const p1 of alphabet)
      for (const p2 of alphabet)
        for (const p3 of alphabet)
          for (const p4 of alphabet) pushSeq([p1, p2, p3, p4]);
    for (const seq of seqs) {
      const plan = buildRenderPlan(seq);
      for (const entry of plan) {
        if (entry.kind === "tools") {
          expect(entry.group, `sequence ${seq.map((p) => p.type).join(",")}`).toBeDefined();
          expect(entry.group.type.startsWith("tool-")).toBe(true);
          expect(entry.group.parts.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

describe("messageHasVisibleContent", () => {
  it("recognizes dynamic-tool parts as visible content", () => {
    const msg: UIMessage = {
      id: "m1",
      role: "assistant",
      parts: [dynamicToolPart("get_search_console_performance")],
    };
    expect(messageHasVisibleContent(msg)).toBe(true);
  });

  it("recognizes tool-* parts as visible content", () => {
    const msg: UIMessage = {
      id: "m1",
      role: "assistant",
      parts: [toolPart("tool-get_search_console_performance")],
    };
    expect(messageHasVisibleContent(msg)).toBe(true);
  });

  it("returns false when message has only empty text parts", () => {
    const msg: UIMessage = {
      id: "m1",
      role: "assistant",
      parts: [textPart("   ")],
    };
    expect(messageHasVisibleContent(msg)).toBe(false);
  });
});
