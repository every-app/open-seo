import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCrawlThrottle } from "@/server/lib/audit/crawl-throttle";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";

const PAGE_URL = "https://example.com/page";
const PAGE_HTML =
  "<html><head><title>A page</title></head><body><h1>A page</h1></body></html>";

/**
 * Answer each fetch with the next reply, repeating the last one. Every call
 * builds a fresh Response: a body can only be read (or cancelled) once.
 */
function stubFetch(...replies: Array<{ status: number; retryAfter?: string }>) {
  let index = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const reply = replies[Math.min(index++, replies.length - 1)];
    return new Response(PAGE_HTML, {
      status: reply.status,
      headers: {
        "content-type": "text/html",
        ...(reply.retryAfter ? { "retry-after": reply.retryAfter } : {}),
      },
    });
  });
}

function crawl() {
  return crawlPage(
    PAGE_URL,
    0,
    false,
    createCrawlThrottle(Date.now() + 90_000),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("crawlPage", () => {
  it("waits out the server's Retry-After and keeps the retried page", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      { status: 429, retryAfter: "5" },
      { status: 200 },
    );

    const crawled = crawl();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    const page = await crawled;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page?.fetchClass).toBe("ok");
    expect(page?.title).toBe("A page");
    // Recovered, but the crawl window should still slow down after it.
    expect(page?.rateLimited).toBe(true);
  });

  it("records a page the site keeps rate limiting, without calling it blocked", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, retryAfter: "1" });

    const crawled = crawl();
    await vi.advanceTimersByTimeAsync(30_000);
    const page = await crawled;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(page?.fetchClass).toBe("rate_limited");
  });

  // A long Retry-After is deferred to a later chunk; one past the audit's
  // whole cooldown budget is recorded as the page's final answer.
  it.each([
    ["defers the URL when its cooldown outlasts the chunk", "600", null, false],
    [
      "records a final 429 when the wait exceeds the cooldown budget",
      "3600",
      "rate_limited",
      true,
    ],
  ])("%s", async (_label, retryAfter, fetchClass, stopped) => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, retryAfter });
    const throttle = createCrawlThrottle(Date.now() + 90_000);

    const page = await crawlPage(PAGE_URL, 0, false, throttle);

    expect(page?.fetchClass ?? null).toBe(fetchClass);
    expect(throttle.stopped).toBe(stopped);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 403 — bot protection is not a speed limit", async () => {
    const fetchMock = stubFetch({ status: 403 });

    const page = await crawl();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page?.fetchClass).toBe("blocked");
  });

  it("flags the platform subrequest limit so the crawl can stop", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Too many subrequests.")),
    );

    const page = await crawl();

    expect(page?.statusCode).toBe(0);
    expect(page?.fetchClass).toBe("error");
    expect(page?.subrequestLimited).toBe(true);
    // Observability shows only the string: the message must survive in it.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Too many subrequests."),
      expect.any(Error),
    );
  });

  it("records ordinary network failures without the platform flag", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    const page = await crawl();

    expect(page?.fetchClass).toBe("error");
    expect(page?.subrequestLimited).toBeUndefined();
  });

  it("preserves extracted metadata and nested values when releasing the HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          `<html><head>
            <title>Example &amp; café 🌱</title>
            <meta name="description" content="Example description &amp; more">
            <meta name="robots" content="noindex">
            <meta property="og:title" content="Example social title 🌱">
            <meta property="og:description" content="Example description">
            <meta property="og:image" content="/social.png">
            <link rel="canonical" href="/canonical">
            <link rel="alternate" hreflang="en" href="/en">
            <script type="application/ld+json">{}</script>
          </head><body><h1>Hello</h1><h2>World</h2>
            <img src="/photo.png" alt="Example photo 🌱"><img src="/missing.png">
            <img alt="">
            <a href="/next" rel="nofollow">More &amp; more 🌱</a>
            <a href="https://other.example/">External</a>
          </body></html>`,
          {
            headers: {
              "content-type": "text/html",
              "x-robots-tag": "nofollow",
              link: '<https://example.com/header>; rel="canonical"',
            },
          },
        ),
      ),
    );

    const page = await crawlPage(
      "https://example.com/",
      2,
      true,
      createCrawlThrottle(Date.now() + 90_000),
    );

    expect(page).toMatchObject({
      url: "https://example.com/",
      statusCode: 200,
      fetchClass: "ok",
      redirectUrl: null,
      title: "Example & café 🌱",
      metaDescription: "Example description & more",
      canonicalUrl: "https://example.com/canonical",
      robotsMeta: "noindex",
      xRobotsTag: "nofollow",
      headerCanonicalUrl: "https://example.com/header",
      ogTitle: "Example social title 🌱",
      ogDescription: "Example description",
      ogImage: "/social.png",
      h1Count: 1,
      h2Count: 1,
      h3Count: 0,
      headingOrder: [1, 2],
      isHtml: true,
      imagesTotal: 3,
      imagesMissingAlt: 1,
      images: [
        { src: "/photo.png", alt: "Example photo 🌱" },
        { src: "/missing.png", alt: null },
        { src: null, alt: "" },
      ],
      links: [
        {
          targetUrl: "https://example.com/next",
          anchor: "More & more 🌱",
          isInternal: true,
          isNofollow: true,
        },
        {
          targetUrl: "https://other.example/",
          anchor: "External",
          isInternal: false,
          isNofollow: false,
        },
      ],
      hasStructuredData: true,
      hreflangTags: ["en"],
      isIndexable: false,
      crawlDepth: 2,
      inSitemap: true,
    });
    expect(page?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(page?.htmlBytes).toBeGreaterThan(0);
  });

  it("does not retain large source HTML in queued crawl results", () => {
    // A dedicated V8 process makes GC available without depending on the test
    // runner's heap. Exercise the real reader/parser with separate streamed
    // bodies; keeping just their titles used to retain every 1 MiB document.
    const result = spawnSync(
      process.execPath,
      [
        "--expose-gc",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
          import assert from "node:assert/strict";
          import { crawlPage } from ${JSON.stringify(new URL("./site-audit-workflow-helpers.ts", import.meta.url).href)};
          import { createCrawlThrottle } from ${JSON.stringify(new URL("../lib/audit/crawl-throttle.ts", import.meta.url).href)};
          const throttle = createCrawlThrottle(Date.now() + 90_000);
          globalThis.fetch = async () => {
            const html = '<title>Example memory regression 🌱</title>' +
              '<meta name="description" content="A small description">' +
              '<script>' + 'x'.repeat(1024 * 1024) + '</script>';
            const bytes = new TextEncoder().encode(html);
            let offset = 0;
            return new Response(new ReadableStream({
              pull(controller) {
                if (offset >= bytes.length) return controller.close();
                controller.enqueue(bytes.subarray(offset, offset + 65536));
                offset += 65536;
              },
            }), { headers: { "content-type": "text/html" } });
          };
          const collect = async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            globalThis.gc();
            globalThis.gc();
            const { heapUsed, external } = process.memoryUsage();
            return heapUsed + external;
          };
          await crawlPage("https://example.com/warmup", 0, true, throttle);
          const before = await collect();
          const pages = [];
          for (let i = 0; i < 50; i++) {
            pages.push(await crawlPage("https://example.com/" + i, 0, true,
              createCrawlThrottle(Date.now() + 90_000)));
          }
          const retained = (await collect()) - before;
          assert.equal(pages.length, 50);
          assert.equal(pages[49].title, "Example memory regression 🌱");
          assert.ok(retained < 16 * 1024 * 1024,
            "Queued results retained " + retained + " bytes of source HTML");
        `,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  }, 25_000);
});
