import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firecrawlMapUrls, firecrawlScrapePage } from "@/server/lib/firecrawl";

const URL = "https://example.com";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("firecrawlScrapePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shapes a scrape into a page and honors the char limit", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { markdown: "  hello world  ", metadata: { title: "Hi" } },
      }),
    );

    const page = await firecrawlScrapePage("fc-key", URL, 5);

    expect(page).toEqual({ url: URL, title: "Hi", text: "hello" });
  });

  it("returns null when Firecrawl reports failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("returns null when the page yields no text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: { markdown: "   " } }),
    );

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("returns null on a non-ok response so the caller falls back", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("returns null on a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("boom"));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });
});

describe("firecrawlMapUrls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts URLs and drops entries without one", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        links: [
          { url: `${URL}/a` },
          { title: "no url here" },
          { url: `${URL}/b` },
        ],
      }),
    );

    const urls = await firecrawlMapUrls("fc-key", URL, 10);

    expect(urls).toEqual([`${URL}/a`, `${URL}/b`]);
  });

  it("returns null when Firecrawl reports failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }));

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toBeNull();
  });
});
