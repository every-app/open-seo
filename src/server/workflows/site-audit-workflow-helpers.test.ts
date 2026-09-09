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

  it("holds every other fetch in the chunk while one URL's 429 pause runs", async () => {
    vi.useFakeTimers();
    const fetched: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      fetched.push(new Request(input).url);
      // Only the first request to the first URL is refused.
      const refused = fetched.length === 1;
      return new Response(PAGE_HTML, {
        status: refused ? 429 : 200,
        headers: {
          "content-type": "text/html",
          ...(refused ? { "retry-after": "5" } : {}),
        },
      });
    });
    const throttle = createCrawlThrottle(Date.now() + 90_000);

    const first = crawlPage(`${PAGE_URL}/first`, 0, false, throttle);
    await vi.advanceTimersByTimeAsync(0);
    const second = crawlPage(`${PAGE_URL}/second`, 0, false, throttle);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetched).toEqual([`${PAGE_URL}/first`]);

    await vi.advanceTimersByTimeAsync(3_000);
    const pages = await Promise.all([first, second]);
    expect(fetched).toHaveLength(3);
    expect(pages.map((page) => page?.fetchClass)).toEqual(["ok", "ok"]);
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

  it("recovers concurrent pages without a burst after sixty seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const starts: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      starts.push(Date.now());
      return new Response(PAGE_HTML, {
        status: Date.now() < 60_000 ? 429 : 200,
        headers: { "content-type": "text/html", "retry-after": "60" },
      });
    });
    const throttle = createCrawlThrottle(90_000);
    const pages = Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        crawlPage(`${PAGE_URL}/${i}`, 0, false, throttle),
      ),
    );
    await vi.advanceTimersByTimeAsync(59_999);
    expect(starts).toEqual([0]);
    await vi.runAllTimersAsync();
    expect((await pages).map((page) => page?.fetchClass)).toEqual(
      Array(5).fill("ok"),
    );
    expect(starts).toEqual([0, 60_000, 62_000, 64_000, 66_000, 68_000]);
  });

  it("defers the refused URL when its cooldown exceeds the chunk deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, retryAfter: "600" });
    const throttle = createCrawlThrottle(Date.now() + 90_000);
    expect(await crawlPage(PAGE_URL, 0, false, throttle)).toBeNull();
    expect(
      await crawlPage(`${PAGE_URL}/unvisited`, 0, false, throttle),
    ).toBeNull();
    expect(throttle.stopped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records a final 429 when the requested wait exceeds the audit's cooldown budget", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, retryAfter: "3600" });
    const throttle = createCrawlThrottle(Date.now() + 90_000);
    expect((await crawlPage(PAGE_URL, 0, false, throttle))?.fetchClass).toBe(
      "rate_limited",
    );
    expect(throttle.stopped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 403 — bot protection is not a speed limit", async () => {
    const fetchMock = stubFetch({ status: 403 });

    const page = await crawl();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page?.fetchClass).toBe("blocked");
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

const LINKED_PAGE_HTML = `<!DOCTYPE html><html><head><title>A page title</title></head>
<body><h1>Hi</h1><p>Body text.</p><a href="/next">next</a></body></html>`;

function serveAs(contentType: string) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(LINKED_PAGE_HTML, {
        status: 200,
        headers: { "content-type": contentType },
      }),
    ),
  );
}

function summarize(page: Awaited<ReturnType<typeof crawlPage>>) {
  return {
    isHtml: page?.isHtml,
    title: page?.title,
    linkCount: page?.links.length,
  };
}

describe("crawlPage content-type classification", () => {
  // The crawler sends `Accept: text/html,application/xhtml+xml`, and media
  // types are case-insensitive, so both spellings must be analyzed.
  it.each([
    "text/html; charset=utf-8",
    "application/xhtml+xml; charset=utf-8",
    "TEXT/HTML",
  ])("analyzes a page served as %s", async (contentType) => {
    serveAs(contentType);

    const page = await crawl();

    expect(summarize(page)).toEqual({
      isHtml: true,
      title: "A page title",
      linkCount: 1,
    });
  });

  it("records a non-HTML document without analyzing it", async () => {
    serveAs("application/pdf");

    const page = await crawl();

    expect(summarize(page)).toEqual({
      isHtml: false,
      title: "",
      linkCount: 0,
    });
  });
});
