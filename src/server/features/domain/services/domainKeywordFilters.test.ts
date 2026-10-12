import { describe, expect, it } from "vitest";
import { buildKeywordFilters } from "@/server/features/domain/services/domainKeywordFilters";

describe("buildKeywordFilters", () => {
  // Include terms are ANDed here (every term must match), unlike the
  // backlinks filters where they're ORed.
  it("translates each filter kind and chains them with 'and'", () => {
    expect(
      buildKeywordFilters({
        include: "audit, checker",
        exclude: "jobs+salary",
        minVol: 100,
        maxVol: 5000,
        minCpc: 0.5,
      }),
    ).toEqual([
      ["keyword_data.keyword", "ilike", "%audit%"],
      "and",
      ["keyword_data.keyword", "ilike", "%checker%"],
      "and",
      ["keyword_data.keyword", "not_ilike", "%jobs%"],
      "and",
      ["keyword_data.keyword", "not_ilike", "%salary%"],
      "and",
      ["keyword_data.keyword_info.search_volume", ">=", 100],
      "and",
      ["keyword_data.keyword_info.search_volume", "<=", 5000],
      "and",
      ["keyword_data.keyword_info.cpc", ">=", 0.5],
    ]);
  });

  it("escapes SQL LIKE wildcards in user-supplied terms", () => {
    const result = buildKeywordFilters({ include: "100%" });
    expect(result[0]).toEqual(["keyword_data.keyword", "ilike", "%100\\%%"]);
  });

  it("ANDs the search OR-group after structured filters", () => {
    const result = buildKeywordFilters({ minVol: 100 }, "audit");
    expect(result).toEqual([
      ["keyword_data.keyword_info.search_volume", ">=", 100],
      "and",
      [
        ["keyword_data.keyword", "ilike", "%audit%"],
        "or",
        ["ranked_serp_element.serp_item.url", "ilike", "%audit%"],
      ],
    ]);
  });

  it("packs exactly 8 conditions without throwing", () => {
    const result = buildKeywordFilters({
      include: "a,b,c,d",
      exclude: "e,f",
      minVol: 1,
      maxVol: 2,
    });
    expect(result.filter((entry) => Array.isArray(entry))).toHaveLength(8);
  });

  it("throws when conditions exceed the 8-condition cap", () => {
    expect(() =>
      buildKeywordFilters({
        include: "a,b,c,d",
        exclude: "e,f",
        minVol: 1,
        maxVol: 2,
        minTraffic: 3,
        maxTraffic: 4,
      }),
    ).toThrow(/Too many filter conditions/);
  });

  it("counts the search OR-group as 2 toward the cap", () => {
    expect(() =>
      buildKeywordFilters(
        {
          include: "a,b,c,d",
          exclude: "e,f",
          minVol: 1,
        },
        "audit",
      ),
    ).toThrow(/Too many filter conditions/);
  });
});
