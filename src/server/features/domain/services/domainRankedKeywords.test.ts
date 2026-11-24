import { beforeEach, expect, it, vi } from "vitest";
import { DomainService } from "@/server/features/domain/services/DomainService";

vi.mock("cloudflare:workers", () => ({ waitUntil: () => {} }));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async () => "key",
  getCached: async () => null,
  setCached: async () => {},
}));

const rankedKeywords = vi.fn();
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ domain: { rankedKeywords } }),
}));

beforeEach(() => {
  rankedKeywords.mockImplementation(
    async ({ itemTypes }: { itemTypes?: string[] }) => {
      // The documented default includes paid results when item_types is omitted.
      const types = itemTypes ?? ["organic", "paid"];
      const ranked = (keyword: string, type: string, rank_absolute: number) => ({
        keyword_data: { keyword },
        ranked_serp_element: { serp_item: { type, rank_absolute } },
      });
      const items = [
        ranked("paid-only keyword", "paid", 1),
        ranked("organic keyword", "organic", 9),
      ].filter((item) => types.includes(item.ranked_serp_element.serp_item.type));
      return { items, totalCount: items.length };
    },
  );
});

const billing = { organizationId: "org" } as never;
const query = {
  projectId: "p",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
};

it("domain overview lists organic positions only", async () => {
  const keywords = await DomainService.getSuggestedKeywords(
    { ...query, organizationId: "org" },
    billing,
  );
  expect(keywords.map((k) => [k.keyword, k.position])).toEqual([
    ["organic keyword", 9],
  ]);
});

it("domain keywords table lists organic positions only", async () => {
  const page = await DomainService.getKeywordsPage(
    {
      ...query,
      page: 1,
      pageSize: 25,
      sortMode: "traffic",
      sortOrder: "desc",
      filters: {},
    } as never,
    billing,
  );
  expect(page.keywords.map((k) => [k.keyword, k.position])).toEqual([
    ["organic keyword", 9],
  ]);
});
