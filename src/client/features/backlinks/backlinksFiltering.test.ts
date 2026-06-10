import { describe, expect, it } from "vitest";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
} from "./backlinksFilterTypes";
import {
  filterBacklinkRows,
  filterReferringDomainRows,
} from "./backlinksFiltering";

type BacklinkRow = BacklinksOverviewData["backlinks"][number];
type ReferringDomainRow = BacklinksOverviewData["referringDomains"][number];

function makeBacklinkRow(overrides: Partial<BacklinkRow> = {}): BacklinkRow {
  return {
    urlFrom: "https://example.com/post",
    urlTo: "https://target.example/page",
    domainFrom: "example.com",
    anchor: "Example",
    itemType: "anchor",
    rank: 10,
    domainFromRank: 20,
    pageFromRank: 10,
    spamScore: 2,
    relAttributes: [],
    firstSeen: null,
    lastSeen: null,
    linksCount: 1,
    isDofollow: true,
    isLost: false,
    isBroken: false,
    ...overrides,
  };
}

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

describe("filterBacklinkRows", () => {
  it("ignores Ahrefs DR range until ratings are loaded for the backlinks table", () => {
    const rows = [
      makeBacklinkRow({ domainFrom: "low.example" }),
      makeBacklinkRow({ domainFrom: "high.example" }),
    ];

    expect(
      filterBacklinkRows(rows, {
        ...EMPTY_BACKLINKS_FILTERS,
        minAhrefsDr: "50",
      }),
    ).toEqual(rows);
  });

  it("filters by loaded Ahrefs DR range for the backlinks table", () => {
    const rows = [
      makeBacklinkRow({ domainFrom: "low.example" }),
      makeBacklinkRow({ domainFrom: "www.high.example" }),
      makeBacklinkRow({ domainFrom: "unknown.example" }),
    ];
    const ratings = {
      "low.example": 12,
      "high.example": 64,
      "unknown.example": null,
    };

    expect(
      filterBacklinkRows(
        rows,
        {
          ...EMPTY_BACKLINKS_FILTERS,
          minAhrefsDr: "50",
        },
        ratings,
      ),
    ).toEqual([rows[1], rows[2]]);

    expect(
      filterBacklinkRows(
        rows,
        {
          ...EMPTY_BACKLINKS_FILTERS,
          maxAhrefsDr: "50",
        },
        ratings,
      ),
    ).toEqual([rows[0], rows[2]]);
  });
});

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

  it("ignores Ahrefs DR range until ratings are loaded for referring domains", () => {
    const rows = [
      makeReferringDomainRow({ domain: "low.example" }),
      makeReferringDomainRow({ domain: "high.example" }),
    ];

    expect(
      filterReferringDomainRows(rows, {
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        minAhrefsDr: "50",
      }),
    ).toEqual(rows);
  });

  it("filters by loaded Ahrefs DR range for referring domains", () => {
    const rows = [
      makeReferringDomainRow({ domain: "low.example" }),
      makeReferringDomainRow({ domain: "high.example" }),
      makeReferringDomainRow({ domain: "unknown.example" }),
    ];
    const ratings = {
      "low.example": 12,
      "high.example": 64,
      "unknown.example": null,
    };

    expect(
      filterReferringDomainRows(
        rows,
        {
          ...EMPTY_REFERRING_DOMAINS_FILTERS,
          minAhrefsDr: "50",
        },
        ratings,
      ),
    ).toEqual([rows[1], rows[2]]);

    expect(
      filterReferringDomainRows(
        rows,
        {
          ...EMPTY_REFERRING_DOMAINS_FILTERS,
          maxAhrefsDr: "50",
        },
        ratings,
      ),
    ).toEqual([rows[0], rows[2]]);
  });
});
