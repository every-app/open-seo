import { describe, expect, it } from "vitest";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { EMPTY_REFERRING_DOMAINS_FILTERS } from "./backlinksFilterTypes";
import { filterReferringDomainRows } from "./backlinksFiltering";

type ReferringDomainRow = BacklinksOverviewData["referringDomains"][number];

function makeReferringDomainRow(
  overrides: Partial<ReferringDomainRow> = {},
): ReferringDomainRow {
  return {
    domain: "example.com",
    backlinks: 10,
    referringPages: 5,
    rank: 20,
    spamScore: 2,
    firstSeen: null,
    brokenBacklinks: 0,
    brokenPages: 0,
    ...overrides,
  };
}

describe("filterReferringDomainRows", () => {
  it("filters by spam score range", () => {
    const rows = [
      makeReferringDomainRow({ domain: "clean.example", spamScore: 1 }),
      makeReferringDomainRow({ domain: "risky.example", spamScore: 7 }),
      makeReferringDomainRow({ domain: "unknown.example", spamScore: null }),
    ];

    expect(
      filterReferringDomainRows(rows, {
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        maxSpamScore: "3",
      }),
    ).toEqual([rows[0], rows[2]]);

    expect(
      filterReferringDomainRows(rows, {
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        minSpamScore: "3",
      }),
    ).toEqual([rows[1], rows[2]]);
  });
});
