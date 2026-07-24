import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirecrawlUnavailableError,
  firecrawlMapUrls,
  firecrawlScrapePage,
} from "@/server/lib/firecrawl";

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

  it("returns null on a malformed but successful response", async () => {
    // Wrong shape (data missing) must fall back gracefully, not throw.
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("throws when the response is non-ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    const call = firecrawlScrapePage("fc-key", URL, 100);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
  });

  it("throws on a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("boom"));

    const call = firecrawlScrapePage("fc-key", URL, 100);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
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

  it("returns null when links is not an array", async () => {
    // Malformed success payload must fall back gracefully, not throw.
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, links: {} }),
    );

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toBeNull();
  });

  it("returns null when Firecrawl reports failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }));

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toBeNull();
  });

  it("throws when the response is non-ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    const call = firecrawlMapUrls("fc-key", URL, 10);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
  });
});
