import { expect, it, vi } from "vitest";
import { domainKeywords } from "../src/lib/seo-report/research";

vi.mock("cloudflare:workers", () => ({ env: {} }));

it("reports organic keyword positions without treating ads as rankings", async () => {
  const ranked = (keyword: string, type: string, rank_group: number) => ({
    keyword_data: { keyword },
    ranked_serp_element: { serp_item: { type, rank_group } },
  });

  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const [{ item_types }] = JSON.parse(String(init.body));
    // The documented default includes paid results when item_types is omitted.
    const types: string[] = item_types ?? ["organic", "paid"];
    const items = [
      ranked("paid-only appointment software", "paid", 1),
      ranked("small clinic appointment software", "organic", 9),
    ].filter((item) => types.includes(item.ranked_serp_element.serp_item.type));

    return Response.json({
      tasks: [{ status_code: 20000, result: [{ items }] }],
    });
  });

  try {
    const report = await domainKeywords(
      { apiKey: "fixture-key", charge: () => {} },
      "example.com",
    );
    expect(report).toContain("small clinic appointment software | 9");
    expect(report).not.toContain("paid-only appointment software");
  } finally {
    vi.unstubAllGlobals();
  }
});
