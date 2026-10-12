import { describe, expect, it } from "vitest";
import { adjustCrawlWindow } from "@/server/lib/audit/crawl-window";
import type { CrawledPageResult } from "@/server/lib/audit/types";
import type { PageFetchClass } from "@/shared/audit-fetch-class";

function page(
  fetchClass: PageFetchClass,
  responseTimeMs: number,
  htmlBytes = 10_000,
): CrawledPageResult {
  return {
    id: "",
    url: "https://example.com/",
    statusCode: fetchClass === "ok" ? 200 : 0,
    fetchClass,
    redirectUrl: null,
    title: "",
    metaDescription: "",
    canonicalUrl: null,
    robotsMeta: null,
    xRobotsTag: null,
    headerCanonicalUrl: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrder: [],
    wordCount: 0,
    contentHash: null,
    isHtml: true,
    htmlBytes,
    rateLimited: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    links: [],
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: true,
    responseTimeMs,
    crawlDepth: 0,
    inSitemap: false,
  };
}

describe("adjustCrawlWindow", () => {
  it("keeps the window on an empty batch", () => {
    expect(adjustCrawlWindow(2, [])).toBe(2);
  });

  // A 429 the retries recovered from still counts as trouble.
  it.each([
    ["a failed fetch", page("error", 300)],
    ["a recovered 429", { ...page("ok", 300), rateLimited: true }],
  ])("reduces concurrency on %s", (_case, troubled) => {
    const recent = Array.from({ length: 10 }, () => troubled);
    expect(adjustCrawlWindow(2, recent)).toBe(1);
  });

  it("never shrinks below one request", () => {
    expect(adjustCrawlWindow(1, [page("error", 15_000)])).toBe(1);
  });

  it("never grows beyond two concurrent requests, even on a fast site", () => {
    const recent = Array.from({ length: 25 }, () => page("ok", 400));
    expect(adjustCrawlWindow(2, recent)).toBe(2);
    expect(adjustCrawlWindow(1, recent)).toBe(2);
  });

  it("preserves the byte budget if page sizes increase", () => {
    const recent = Array.from({ length: 25 }, () =>
      page("ok", 300, 5 * 1024 * 1024),
    );
    expect(adjustCrawlWindow(2, recent)).toBe(1);
  });
});
