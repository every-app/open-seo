import { describe, expect, it } from "vitest";
import {
  computeShareOfVoice,
  resolveCompetitorGroups,
  type CrossOutcome,
} from "./shareOfVoice";
import type { LlmCrossAggregatedItem } from "@/server/lib/dataforseoLlmSchemas";

function crossItem(
  key: string,
  platformMentions: Array<{ key: string; mentions: number | null }>,
): LlmCrossAggregatedItem {
  return {
    key,
    platform: platformMentions.map((p) => ({
      key: p.key,
      mentions: p.mentions,
      ai_search_volume: null,
    })),
  };
}

describe("computeShareOfVoice", () => {
  it("sums requested rows, excludes nulls, and ignores unrequested provider rows", () => {
    const outcomes: CrossOutcome[] = [
      {
        platform: "google",
        status: "success",
        items: [
          crossItem("acme", [{ key: "google", mentions: 30 }]),
          crossItem("rival", [{ key: "google", mentions: 10 }]),
          crossItem("ghost", [{ key: "google", mentions: null }]),
          crossItem("unexpected", [{ key: "google", mentions: 60 }]),
        ],
      },
    ];

    const entries = computeShareOfVoice(outcomes, "acme", [
      "rival",
      "ghost",
    ])!.entries;

    expect(entries.map((entry) => entry.label)).toEqual([
      "acme",
      "rival",
      "ghost",
    ]);
    expect(entries[0]).toMatchObject({ label: "acme", sharePct: 75 });
    expect(entries[1]).toMatchObject({ label: "rival", sharePct: 25 });
    expect(entries[2]).toMatchObject({ mentions: null, sharePct: null });
  });

  it("returns null with no competitors or no successful calls", () => {
    expect(computeShareOfVoice([], "acme", [])).toBe(null);
    expect(
      computeShareOfVoice(
        [
          { platform: "chat_gpt", status: "error", items: [] },
          { platform: "google", status: "error", items: [] },
        ],
        "acme",
        ["rival"],
      ),
    ).toBe(null);
  });
});

describe("resolveCompetitorGroups", () => {
  it("dedupes case-insensitively and drops target collisions", () => {
    const groups = resolveCompetitorGroups("Nike", [
      "nike",
      "Adidas",
      "ADIDAS",
      "puma.com",
      "www.PUMA.com",
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Adidas", "puma.com"]);
  });
});
