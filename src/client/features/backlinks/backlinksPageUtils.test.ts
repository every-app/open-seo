import { describe, expect, it } from "vitest";
import type { BacklinksRow } from "./backlinksPageTypes";
import { groupBacklinksByDomain } from "./backlinksPageUtils";

function makeBacklinkRow(overrides: Partial<BacklinksRow> = {}): BacklinksRow {
  return {
    domainFrom: "source.example",
    urlFrom: "https://source.example/post",
    urlTo: "https://target.example/",
    anchor: null,
    itemType: null,
    isDofollow: true,
    relAttributes: [],
    rank: null,
    domainFromRank: null,
    pageFromRank: null,
    spamScore: null,
    firstSeen: null,
    lastSeen: null,
    isLost: false,
    isBroken: false,
    linksCount: null,
    ...overrides,
  };
}

describe("groupBacklinksByDomain", () => {
  it("sums grouped backlink totals from linksCount", () => {
    const groups = groupBacklinksByDomain([
      makeBacklinkRow({ linksCount: 5 }),
      makeBacklinkRow({
        urlFrom: "https://source.example/second-post",
        urlTo: "https://target.example/pricing",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.backlinkCount).toBe(6);
  });

  it("falls back to one backlink when linksCount is missing", () => {
    const groups = groupBacklinksByDomain([
      makeBacklinkRow({ linksCount: null }),
      makeBacklinkRow({
        domainFrom: "other.example",
        urlFrom: "https://other.example/post",
        linksCount: 0,
      }),
    ]);

    expect(groups.map((group) => group.backlinkCount)).toEqual([1, 1]);
  });
});
