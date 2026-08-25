import { describe, expect, it } from "vitest";
import {
  BACKLINKS_SUBFOLDER_FILTER_CONDITIONS,
  parseResearchTarget,
  RESEARCH_SCOPES,
  RESEARCH_SCOPE_FILTER_SLOTS,
} from "@/shared/researchScope";
import {
  buildBacklinksScopeFilter,
  buildRankedKeywordsScopeFilter,
  buildRelevantPagesScopeFilter,
} from "./researchScopeFilters";

function target(
  input: string,
  scope: Parameters<typeof parseResearchTarget>[1],
) {
  const parsed = parseResearchTarget(input, scope);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.target;
}

describe("buildRankedKeywordsScopeFilter", () => {
  it("adds nothing for subdomains scope", () => {
    expect(
      buildRankedKeywordsScopeFilter(target("example.com", "subdomains")),
    ).toEqual({ clauses: [], conditionCount: 0 });
  });

  it("pins the exact hostname (plus www) for domain scope", () => {
    const filter = buildRankedKeywordsScopeFilter(
      target("example.com", "domain"),
    );
    expect(filter.clauses).toEqual([
      [
        "ranked_serp_element.serp_item.domain",
        "in",
        ["example.com", "www.example.com"],
      ],
    ]);
    expect(filter.conditionCount).toBe(1);
  });

  it("matches the subfolder, its children, and query variants — not siblings", () => {
    const filter = buildRankedKeywordsScopeFilter(
      target("example.com/blog", "subfolder"),
    );
    expect(filter.clauses[1]).toEqual([
      ["ranked_serp_element.serp_item.relative_url", "=", "/blog"],
      "or",
      ["ranked_serp_element.serp_item.relative_url", "like", "/blog/%"],
      "or",
      ["ranked_serp_element.serp_item.relative_url", "like", "/blog?%"],
    ]);
    expect(filter.conditionCount).toBe(4);
  });

  it("escapes like wildcards in the path but not equality values", () => {
    const filter = buildRankedKeywordsScopeFilter(
      target("example.com/100%25_deals", "subfolder"),
    );
    expect(filter.clauses[1]).toEqual([
      ["ranked_serp_element.serp_item.relative_url", "=", "/100%25_deals"],
      "or",
      [
        "ranked_serp_element.serp_item.relative_url",
        "like",
        "/100\\%25\\_deals/%",
      ],
      "or",
      [
        "ranked_serp_element.serp_item.relative_url",
        "like",
        "/100\\%25\\_deals?%",
      ],
    ]);
  });

  it("covers trailing-slash and query variants for exact_url scope", () => {
    const filter = buildRankedKeywordsScopeFilter(
      target("example.com/pricing", "exact_url"),
    );
    expect(filter.clauses[1]).toEqual([
      [
        "ranked_serp_element.serp_item.relative_url",
        "in",
        ["/pricing", "/pricing/"],
      ],
      "or",
      ["ranked_serp_element.serp_item.relative_url", "like", "/pricing?%"],
      "or",
      ["ranked_serp_element.serp_item.relative_url", "like", "/pricing/?%"],
    ]);
  });
});

describe("buildRelevantPagesScopeFilter", () => {
  it("pins both host variants for domain scope", () => {
    const filter = buildRelevantPagesScopeFilter(
      target("example.com", "domain"),
    );
    expect(filter.clauses).toEqual([
      [
        ["page_address", "like", "%://example.com/%"],
        "or",
        ["page_address", "like", "%://www.example.com/%"],
      ],
    ]);
    expect(filter.conditionCount).toBe(2);
  });

  it("builds absolute prefix patterns for subfolder scope", () => {
    const filter = buildRelevantPagesScopeFilter(
      target("example.com/blog", "subfolder"),
    );
    expect(filter.clauses[0]).toEqual([
      ["page_address", "like", "%://example.com/blog"],
      "or",
      ["page_address", "like", "%://example.com/blog/%"],
      "or",
      ["page_address", "like", "%://www.example.com/blog"],
      "or",
      ["page_address", "like", "%://www.example.com/blog/%"],
    ]);
    expect(filter.conditionCount).toBe(4);
  });
});

it("keeps the shared filter-slot constants in sync with the built clauses", () => {
  for (const scope of RESEARCH_SCOPES) {
    const parsed = target("example.com/blog", scope);
    expect(buildRankedKeywordsScopeFilter(parsed).conditionCount).toBe(
      RESEARCH_SCOPE_FILTER_SLOTS.keywords[parsed.scope],
    );
    expect(buildRelevantPagesScopeFilter(parsed).conditionCount).toBe(
      RESEARCH_SCOPE_FILTER_SLOTS.pages[parsed.scope],
    );
  }
  expect(
    buildBacklinksScopeFilter("url_to", {
      scope: "subfolder",
      apiTarget: "example.com",
      path: "/blog",
    }).conditionCount,
  ).toBe(BACKLINKS_SUBFOLDER_FILTER_CONDITIONS);
});
