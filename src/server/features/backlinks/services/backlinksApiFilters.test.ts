import { describe, expect, it } from "vitest";
import {
  countFilterConditions,
  toBacklinksFiltersPayload,
  type BacklinksTabFilterValues,
  EMPTY_BACKLINKS_FILTERS,
} from "@/client/features/backlinks/backlinksFilterTypes";
import {
  buildBacklinksRowsApiFilters,
  buildReferringDomainsApiFilters,
  buildTopPagesApiFilters,
} from "./backlinksApiFilters";

describe("buildBacklinksRowsApiFilters", () => {
  it("ORs include terms in one group and ANDs everything else", () => {
    expect(
      buildBacklinksRowsApiFilters({
        include: "blog, news",
        exclude: "spam",
        minDomainRank: 30,
        linkType: "dofollow",
        hideLost: true,
      }),
    ).toEqual([
      [["url_from", "ilike", "%blog%"], "or", ["url_from", "ilike", "%news%"]],
      "and",
      ["url_from", "not_ilike", "%spam%"],
      "and",
      ["domain_from_rank", ">=", 30],
      "and",
      ["dofollow", "=", true],
      "and",
      ["is_lost", "=", false],
    ]);
  });

  it("emits a single include term as a plain condition", () => {
    expect(buildBacklinksRowsApiFilters({ include: "blog" })).toEqual([
      ["url_from", "ilike", "%blog%"],
    ]);
  });

  it("escapes LIKE wildcards in terms", () => {
    expect(buildBacklinksRowsApiFilters({ include: "wp_content" })).toEqual([
      ["url_from", "ilike", "%wp\\_content%"],
    ]);
  });

  it("returns no expressions for empty filters", () => {
    expect(buildBacklinksRowsApiFilters({})).toEqual([]);
  });

  it("throws when the condition budget is exceeded", () => {
    expect(() =>
      buildBacklinksRowsApiFilters({
        include: "a, b, c, d, e",
        exclude: "f, g, h, i",
      }),
    ).toThrowError(/Too many filter conditions/);
  });
});

describe("buildReferringDomainsApiFilters", () => {
  it("filters on referring-domain fields", () => {
    expect(
      buildReferringDomainsApiFilters({
        include: "edu",
        minBacklinks: 5,
        maxSpamScore: 30,
      }),
    ).toEqual([
      ["domain", "ilike", "%edu%"],
      "and",
      ["backlinks", ">=", 5],
      "and",
      ["backlinks_spam_score", "<=", 30],
    ]);
  });
});

describe("buildTopPagesApiFilters", () => {
  it("filters on the url field", () => {
    expect(
      buildTopPagesApiFilters({ include: "/blog", minReferringDomains: 2 }),
    ).toEqual([
      ["url", "ilike", "%/blog%"],
      "and",
      ["referring_domains", ">=", 2],
    ]);
  });
});

describe("client condition count vs server condition budget", () => {
  // The client gates Apply with countFilterConditions; the server enforces the
  // DataForSEO budget while building. They must agree on how many conditions a
  // set of filter values produces, or users get hard errors the UI accepted.
  function serverConditionCount(values: BacklinksTabFilterValues): number {
    const expressions = buildBacklinksRowsApiFilters(
      toBacklinksFiltersPayload(values),
    );
    let count = 0;
    for (const expression of expressions) {
      if (expression === "and") continue;
      // An include OR-group contains nested clauses and "or" connectors.
      count +=
        Array.isArray(expression) && Array.isArray(expression[0])
          ? Math.ceil(expression.length / 2)
          : 1;
    }
    return count;
  }

  const cases: Array<[string, BacklinksTabFilterValues]> = [
    ["empty", { ...EMPTY_BACKLINKS_FILTERS }],
    [
      "terms and ranges",
      {
        ...EMPTY_BACKLINKS_FILTERS,
        include: "blog, news",
        exclude: "spam",
        minDomainRank: "30",
        maxSpamScore: "50",
      },
    ],
    [
      "toggles",
      {
        ...EMPTY_BACKLINKS_FILTERS,
        linkType: "nofollow",
        hideLost: "true",
        hideBroken: "true",
      },
    ],
    [
      "everything",
      {
        ...EMPTY_BACKLINKS_FILTERS,
        include: "a",
        exclude: "b",
        minDomainRank: "1",
        maxDomainRank: "90",
        minLinkAuthority: "2",
        linkType: "dofollow",
        hideLost: "true",
      },
    ],
  ];

  it.each(cases)("matches for %s", (_name, values) => {
    expect(serverConditionCount(values)).toBe(countFilterConditions(values));
  });
});
