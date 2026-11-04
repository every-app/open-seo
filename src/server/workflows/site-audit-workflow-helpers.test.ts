import { spawnSync } from "node:child_process";
import { createAuditFetchDiagnostics } from "@/server/lib/audit/fetch-diagnostics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCrawlThrottle } from "@/server/lib/audit/crawl-throttle";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";
import { shopifyCrawlerHeaders } from "@/shared/crawler-access";

// No crawl gateway and no signing key configured: publicFetch is plain fetch
// and requests go unsigned, and both env lookups must settle in microtasks so
// the fake-timer cases below can advance past them.
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => undefined,
}));

const PAGE_URL = "https://example.com/page";
const PAGE_HTML =
  "<html><head><title>A page</title></head><body><h1>A page</h1></body></html>";

/**
 * Answer each fetch with the next reply, repeating the last one. Every call
 * builds a fresh Response: a body can only be read (or cancelled) once.
 */
function stubFetch(
  ...replies: Array<{
    status: number;
    retryAfter?: string;
    mitigated?: boolean;
    contentType?: string;
  }>
) {
  let index = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const reply = replies[Math.min(index++, replies.length - 1)];
    return new Response(PAGE_HTML, {
      status: reply.status,
      headers: {
        "content-type": reply.contentType ?? "text/html",
        ...(reply.mitigated ? { "cf-mitigated": "challenge" } : {}),
        ...(reply.retryAfter ? { "retry-after": reply.retryAfter } : {}),
      },
    });
  });
}

function crawl(options?: Parameters<typeof crawlPage>[4]) {
  return crawlPage(
    PAGE_URL,
    0,
    false,
    createCrawlThrottle(Date.now() + 90_000),
    options,
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

  it("reports every crawl attempt to bounded audit diagnostics", async () => {
    vi.useFakeTimers();
    stubFetch({ status: 429, retryAfter: "5" }, { status: 200 });
    const diagnostics = { record: vi.fn() };

    const crawled = crawlPage(
      PAGE_URL,
      0,
      false,
      createCrawlThrottle(Date.now() + 90_000),
      { diagnostics },
    );
    await vi.advanceTimersByTimeAsync(6_000);
    await crawled;

    expect(diagnostics.record).toHaveBeenCalledTimes(2);
    expect(diagnostics.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: "crawl",
        attempt: 1,
        status: 429,
        retryAfter: "5",
      }),
    );
    expect(diagnostics.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ phase: "crawl", attempt: 2, status: 200 }),
    );
  });

  it.each([
    ["matching host", "example.com", null, true],
    ["different host", "other.example", null, false],
    ["expired credential", "example.com", "2000-01-01T00:00:00Z", false],
  ])(
    "logs the headers actually sent for %s",
    async (_label, host, expiresAt, expected) => {
      const fetchMock = stubFetch({ status: 200 });
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const access = {
        host,
        expiresAt,
        headers: shopifyCrawlerHeaders(
          "sig1=(...)",
          "sig1=:private-signature:",
        ),
      };
      await crawlPage(
        PAGE_URL,
        0,
        false,
        createCrawlThrottle(Date.now() + 90_000),
        {
          access,
          diagnostics: createAuditFetchDiagnostics("audit-header-check"),
        },
      );
      const sentHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
      expect(sentHeaders.has("Signature")).toBe(expected);
      await vi.waitFor(() => {
        expect(info).toHaveBeenCalledWith(
          "site_audit:fetch",
          expect.objectContaining({
            signatureAttached: expected,
            headerPresence: {
              "Signature-Input": expected,
              Signature: expected,
              "Signature-Agent": expected,
            },
          }),
        );
      });
      expect(JSON.stringify(info.mock.calls)).not.toContain(
        "private-signature",
      );
    },
  );

  it("records a page the site keeps rate limiting, without calling it blocked", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, retryAfter: "1" });

    const crawled = crawl();
    await vi.advanceTimersByTimeAsync(30_000);
    const page = await crawled;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page?.fetchClass).toBe("rate_limited");
  });

  it("logs safe signed-request diagnostics for a final 429", async () => {
    vi.useFakeTimers();
    stubFetch({ status: 429, retryAfter: "1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const crawled = crawlPage(
      PAGE_URL,
      0,
      false,
      createCrawlThrottle(Date.now() + 90_000),
      {
        auditId: "audit-1",
        access: {
          host: "example.com",
          headers: shopifyCrawlerHeaders("sig1=(...)", "sig1=:secret:"),
          expiresAt: null,
        },
      },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await crawled;

    expect(warn).toHaveBeenCalledWith("site_audit:fetch_failure", {
      auditId: "audit-1",
      hostname: "example.com",
      status: 429,
      signatureAttached: true,
      redirectOutcome: "not_followed",
      retryAfter: "1",
      errorCategory: "rate_limited",
    });
  });

  // A long Retry-After is deferred to a later chunk; one past the audit's
  // whole cooldown budget is recorded as the page's final answer.
  it.each([
    ["defers the URL when its cooldown outlasts the chunk", "600", null, false],
    [
      "records a final 429 when the wait exceeds the cooldown budget",
      "8000",
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

  it("classifies a 429 Challenge Page without the minutes-long rate-limit retry", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, mitigated: true });
    const crawled = crawl();
    await vi.advanceTimersByTimeAsync(90_000);
    const page = await crawled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({
      statusCode: 429,
      fetchClass: "blocked",
      rateLimited: false,
    });
  });

  it("uses the requested renderer for a 429 Challenge Page", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ status: 429, mitigated: true });
    const render = vi.fn().mockResolvedValue({ html: PAGE_HTML, status: 200 });
    const crawled = crawlPage(
      PAGE_URL,
      0,
      false,
      createCrawlThrottle(Date.now() + 90_000),
      { render },
    );
    await vi.advanceTimersByTimeAsync(90_000);
    const page = await crawled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(PAGE_URL);
    expect(page).toMatchObject({
      statusCode: 200,
      fetchClass: "ok",
      title: "A page",
    });
  });

  it("honours an explicit Retry-After on a challenged 429", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      { status: 429, mitigated: true, retryAfter: "5" },
      { status: 200 },
    );
    const crawled = crawl();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await crawled)?.fetchClass).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 403 — bot protection is not a speed limit", async () => {
    const fetchMock = stubFetch({ status: 403 });

    const page = await crawl();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page?.fetchClass).toBe("blocked");
  });

  it("renders a page blocked by a 403 that isn't HTML", async () => {
    // Shared-host firewalls refuse before the site, often without an HTML page.
    stubFetch({ status: 403, contentType: "text/plain" });

    const page = await crawl({
      render: async () => ({ html: PAGE_HTML, status: 200 }),
    });

    expect(page).toMatchObject({
      statusCode: 200,
      fetchClass: "ok",
      title: "A page",
    });
  });
});

describe("crawlPage metadata", () => {
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
