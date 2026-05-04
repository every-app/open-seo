import { describe, expect, it } from "vitest";
import {
  buildKeywordFilters,
  buildOrderBy,
} from "@/server/features/domain/services/domainKeywordFilters";

describe("buildOrderBy", () => {
  it("maps sort modes to DataForSEO field paths", () => {
    expect(buildOrderBy("rank", "asc")).toEqual([
      "ranked_serp_element.serp_item.rank_absolute,asc",
    ]);
    expect(buildOrderBy("volume", "desc")).toEqual([
      "keyword_data.keyword_info.search_volume,desc",
    ]);
    expect(buildOrderBy("score", "asc")).toEqual([
      "keyword_data.keyword_properties.keyword_difficulty,asc",
    ]);
  });
});

describe("buildKeywordFilters", () => {
  it("returns an empty array when no filters are set", () => {
    expect(buildKeywordFilters({})).toEqual([]);
  });

  it("emits one ilike clause per include term and chains them with 'and'", () => {
    expect(buildKeywordFilters({ include: "audit, checker" })).toEqual([
      ["keyword_data.keyword", "ilike", "%audit%"],
      "and",
      ["keyword_data.keyword", "ilike", "%checker%"],
    ]);
  });

  it("emits not_ilike clauses for exclude terms", () => {
    expect(buildKeywordFilters({ exclude: "jobs+salary" })).toEqual([
      ["keyword_data.keyword", "not_ilike", "%jobs%"],
      "and",
      ["keyword_data.keyword", "not_ilike", "%salary%"],
    ]);
  });

  it("escapes SQL LIKE wildcards in user-supplied terms", () => {
    const result = buildKeywordFilters({ include: "100%" });
    expect(result[0]).toEqual(["keyword_data.keyword", "ilike", "%100\\%%"]);
  });

  it("includes numeric range conditions", () => {
    const result = buildKeywordFilters({
      minVol: 100,
      maxVol: 5000,
      minCpc: 0.5,
    });
    expect(result).toEqual([
      ["keyword_data.keyword_info.search_volume", ">=", 100],
      "and",
      ["keyword_data.keyword_info.search_volume", "<=", 5000],
      "and",
      ["keyword_data.keyword_info.cpc", ">=", 0.5],
    ]);
  });

  it("emits an OR group matching keyword or url for the search term", () => {
    const result = buildKeywordFilters({}, "audit");
    expect(result).toEqual([
      [
        ["keyword_data.keyword", "ilike", "%audit%"],
        "or",
        ["ranked_serp_element.serp_item.url", "ilike", "%audit%"],
      ],
    ]);
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
    const arrayClauses = result.filter((entry) => Array.isArray(entry));
    expect(arrayClauses).toHaveLength(8);
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
