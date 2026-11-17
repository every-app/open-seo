import { describe, expect, it } from "vitest";
import {
  buildOpportunities,
  NO_COMPETITORS_NOTE,
  selectLostLinks,
  splitGainedAndSpam,
} from "@/server/features/backlink-watch/backlinkWatchRules";
import type { DomainIntersectionItem } from "@/server/lib/dataforseo";
import type { BacklinkWatchLink } from "@/types/schemas/backlinkWatch";

const SPAM_THRESHOLD = 40;
const WINDOW_START = "2026-11-10";

function link(overrides: Partial<BacklinkWatchLink> = {}): BacklinkWatchLink {
  return {
    domainFrom: "example.com",
    urlFrom: null,
    urlTo: null,
    anchor: null,
    isDofollow: true,
    domainRank: 50,
    spamScore: 5,
    firstSeen: "2026-11-12 08:30:00 +00:00",
    lostDate: "2026-11-12 08:30:00 +00:00",
    ...overrides,
  };
}

function lostOptions(importantMinDomainRank = 20) {
  return {
    windowStart: WINDOW_START,
    importantMinDomainRank,
    spamThreshold: SPAM_THRESHOLD,
  };
}

describe("selectLostLinks", () => {
  it("marks only dofollow, clean, high-rank lost links as important", () => {
    const result = selectLostLinks(
      [
        link({ domainFrom: "good.com" }),
        link({ domainFrom: "nofollow.com", isDofollow: false }),
        link({ domainFrom: "lowrank.com", domainRank: 5 }),
        link({ domainFrom: "spammy.com", spamScore: 80 }),
      ],
      lostOptions(),
    );

    expect(result.filter((r) => r.important).map((r) => r.domainFrom)).toEqual([
      "good.com",
    ]);
    expect(result).toHaveLength(4);
    expect(result[0]?.domainFrom).toBe("good.com");
  });

  it("treats a domain rank exactly at the threshold as important", () => {
    const [result] = selectLostLinks([link({ domainRank: 20 })], lostOptions());
    expect(result?.important).toBe(true);
  });

  it("excludes links lost outside the window", () => {
    const result = selectLostLinks(
      [
        link({ domainFrom: "in.com", lostDate: "2026-11-10 00:00:00 +00:00" }),
        link({ domainFrom: "old.com", lostDate: "2026-11-09 23:59:59 +00:00" }),
        link({ domainFrom: "unknown.com", lostDate: null }),
      ],
      lostOptions(),
    );
    expect(result.map((r) => r.domainFrom)).toEqual(["in.com"]);
  });
});

describe("splitGainedAndSpam", () => {
  it("counts spam separately and never returns it as gained", () => {
    const { gained, spam } = splitGainedAndSpam(
      [
        link({ domainFrom: "real.com", spamScore: 10 }),
        link({ domainFrom: "junk.com", spamScore: 90 }),
      ],
      { windowStart: WINDOW_START, spamThreshold: SPAM_THRESHOLD },
    );
    expect(gained.map((r) => r.domainFrom)).toEqual(["real.com"]);
    expect(spam.map((r) => r.domainFrom)).toEqual(["junk.com"]);
  });

  it("excludes links first seen outside the window", () => {
    const { gained, spam } = splitGainedAndSpam(
      [
        link({
          domainFrom: "new.com",
          firstSeen: "2026-11-10 00:00:00 +00:00",
        }),
        link({
          domainFrom: "old.com",
          firstSeen: "2026-11-09 23:59:59 +00:00",
        }),
        link({
          domainFrom: "oldspam.com",
          firstSeen: "2026-10-01 00:00:00 +00:00",
          spamScore: 90,
        }),
      ],
      { windowStart: WINDOW_START, spamThreshold: SPAM_THRESHOLD },
    );
    expect(gained.map((r) => r.domainFrom)).toEqual(["new.com"]);
    expect(spam).toEqual([]);
  });
});

function intersection(
  entries: Record<string, { target: string; rank: number }>,
): DomainIntersectionItem {
  return {
    domain_intersection: Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        { ...entry, backlinks_spam_score: 5 },
      ]),
    ),
  };
}

describe("buildOpportunities", () => {
  it("ranks sites linking to more competitors first, then by domain rank", () => {
    const { opportunities } = buildOpportunities({
      competitors: ["a.com", "b.com"],
      spamThreshold: SPAM_THRESHOLD,
      items: [
        intersection({ "1": { target: "highrank-one.com", rank: 90 } }),
        intersection({
          "1": { target: "lowrank-two.com", rank: 30 },
          "2": { target: "lowrank-two.com", rank: 30 },
        }),
        intersection({ "2": { target: "midrank-one.com", rank: 60 } }),
      ],
    });
    expect(opportunities.map((o) => o.domain)).toEqual([
      "lowrank-two.com",
      "highrank-one.com",
      "midrank-one.com",
    ]);
    expect(opportunities[0]?.competitors).toEqual(["a.com", "b.com"]);
  });

  it("skips opportunities with a note when no competitors are saved", () => {
    expect(
      buildOpportunities({
        competitors: [],
        items: [],
        spamThreshold: SPAM_THRESHOLD,
      }),
    ).toEqual({ opportunities: [], notes: [NO_COMPETITORS_NOTE] });
  });
});
