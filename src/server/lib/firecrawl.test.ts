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

  it("returns null when a successful response has no data", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("returns null when the page yields no text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: { markdown: "   " } }),
    );

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("returns null when the response body exceeds the size cap", async () => {
    // An oversized body is a per-URL condition (one huge page/PDF), not a
    // service failure — it must fall back for this URL, not throw and trip
    // the caller's circuit breaker.
    const oversized = `{"pad":"${"x".repeat(2_000_001)}"}`;
    vi.mocked(fetch).mockResolvedValue(new Response(oversized));

    expect(await firecrawlScrapePage("fc-key", URL, 100)).toBeNull();
  });

  it("throws on an unexpected response shape", async () => {
    // No `success` field at all — a contract change, not empty content.
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ foo: "bar" }));

    const call = firecrawlScrapePage("fc-key", URL, 100);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
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

  it("returns an empty list when there are no links", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, links: [] }),
    );

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toEqual([]);
  });

  it("returns null when Firecrawl reports failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }));

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toBeNull();
  });

  it("returns null when the response body exceeds the size cap", async () => {
    const oversized = `{"pad":"${"x".repeat(2_000_001)}"}`;
    vi.mocked(fetch).mockResolvedValue(new Response(oversized));

    expect(await firecrawlMapUrls("fc-key", URL, 10)).toBeNull();
  });

  it("throws when links is the wrong type", async () => {
    // Malformed success payload — a contract change, so trip the breaker.
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, links: {} }),
    );

    const call = firecrawlMapUrls("fc-key", URL, 10);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
  });

  it("throws when the response is non-ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    const call = firecrawlMapUrls("fc-key", URL, 10);
    await expect(call).rejects.toBeInstanceOf(FirecrawlUnavailableError);
  });
});
