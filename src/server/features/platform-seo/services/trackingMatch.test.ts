import { describe, expect, it } from "vitest";
import { isCited, isIndexed, positionOf, siteQuery } from "./trackingMatch";

const live = "https://dev.to/rob/parasite-seo-1abc";
const organic = (url: string, rank: number) => ({
  type: "organic",
  url,
  rank_group: rank,
});

describe("tracking match", () => {
  it("finds the copy's own URL, not another post on the same site", () => {
    const items = [
      organic("https://dev.to/someone/parasite-seo-guide", 2),
      { type: "people_also_ask", url: live, rank_group: 3 },
      organic("http://www.dev.to/rob/parasite-seo-1abc/?utm=x#top", 7),
    ];
    expect(positionOf(items, live)).toBe(7);
    expect(positionOf(items.slice(0, 2), live)).toBeNull();
  });

  it("reads a site: search and AI sources for the same page", () => {
    expect(siteQuery(live)).toBe("site:dev.to/rob/parasite-seo-1abc");
    expect(isIndexed([organic(`${live}/comments`, 1)], live)).toBe(true);
    expect(
      isIndexed([organic("https://dev.to/rob/parasite-seo-1abcd", 1)], live),
    ).toBe(false);
    expect(isCited(["https://dev.to/rob/parasite-seo-1abc/"], live)).toBe(true);
  });
});
