import { describe, expect, it, vi } from "vitest";
import { createCrawlThrottle } from "@/server/lib/audit/crawl-throttle";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";

const PAGE_URL = "https://example.com/page";
const PAGE_HTML =
  "<html><head><title>A page</title></head><body><h1>A page</h1></body></html>";
// What SiteGround's bot protection answers a datacenter crawler, with a 202.
const SITEGROUND_CHALLENGE =
  '<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Fpage"></meta></head></html>';
// AWS WAF's challenge action, also a 202: an empty title and a script.
const AWS_WAF_CHALLENGE =
  '<html><head><title></title><script src="https://example.token.awswaf.com/challenge.js"></script></head><body></body></html>';
function stubFetch({
  status,
  body = PAGE_HTML,
  headers = {},
}: {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, {
      status,
      headers: {
        "content-type": "text/html",
        "x-robots-tag": "noindex",
        ...headers,
      },
    }),
  );
}
function crawl(render?: ReturnType<typeof rendered>) {
  return crawlPage(
    PAGE_URL,
    0,
    false,
    createCrawlThrottle(Date.now() + 90_000),
    { render },
  );
}
const renderedHtml =
  '<html><head><title>Rendered title</title></head><body><h1>Loaded heading</h1><p>These words loaded through JavaScript.</p><a href="/discovered">Next page</a></body></html>';
function rendered(html = renderedHtml, status: number | null = 200) {
  return vi.fn().mockResolvedValue({ html, status });
}

describe("crawlPage with JavaScript rendering", () => {
  it("analyzes rendered words, metadata and links while keeping the direct response's status and headers", async () => {
    stubFetch({ status: 200 });
    const page = await crawl(rendered());
    expect(page).toMatchObject({
      title: "Rendered title",
      h1Count: 1,
      statusCode: 200,
      fetchClass: "ok",
      isIndexable: false,
    });
    expect(page?.wordCount).toBeGreaterThan(5);
    expect(page?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetUrl: "https://example.com/discovered",
        }),
      ]),
    );
  });

  it("flags an app shell, rendered or not, and clears the warning when rendered content is available", async () => {
    const shell =
      '<div id="root">Loading...</div><script src="/app.js"></script>';
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(shell, { headers: { "content-type": "text/html" } }),
    );
    expect(await crawl()).toMatchObject({
      javascriptShell: true,
      contentHash: null,
    });
    expect(await crawl(rendered(shell))).toMatchObject({
      javascriptShell: true,
    });
    expect(await crawl(rendered())).toMatchObject({ javascriptShell: false });
  });

  it("does not analyze a challenge page returned by the renderer", async () => {
    stubFetch({ status: 200 });
    expect(
      await crawl(rendered("<title>Just a moment...</title>")),
    ).toMatchObject({ statusCode: 200, fetchClass: "blocked", wordCount: 0 });
  });

  it.each([
    { status: 202, body: SITEGROUND_CHALLENGE },
    { status: 403, headers: { "cf-mitigated": "challenge" } },
  ])(
    "renders a page behind a $status bot challenge as the page it loaded",
    async (response) => {
      stubFetch(response);
      // Context reports no status; a page it returns is one that loaded.
      expect(await crawl(rendered(renderedHtml, null))).toMatchObject({
        title: "Rendered title",
        statusCode: 200,
        fetchClass: "ok",
      });
    },
  );

  it("keeps a challenge that no renderer passed blocked, not failed", async () => {
    stubFetch({ status: 202, body: SITEGROUND_CHALLENGE });
    const render = rendered();
    render.mockRejectedValue(new Error("Unable to render this page"));
    expect(await crawl(render)).toMatchObject({
      statusCode: 202,
      fetchClass: "blocked",
    });
  });

  it("marks a 202 bot challenge blocked instead of auditing it when rendering is off", async () => {
    stubFetch({ status: 202, body: AWS_WAF_CHALLENGE });
    expect(await crawl()).toMatchObject({
      statusCode: 202,
      fetchClass: "blocked",
      wordCount: 0,
    });
  });

  it.each([301, 401, 404, 500])(
    "does not render a direct HTTP %s",
    async (status) => {
      stubFetch({ status });
      const render = rendered();
      await crawl(render);
      expect(render).not.toHaveBeenCalled();
    },
  );

  it("keeps a failed render as an unread page rather than auditing the HTML shell", async () => {
    stubFetch({ status: 200 });
    const render = rendered();
    render.mockRejectedValue(new Error("Unable to render this page"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await crawl(render)).toMatchObject({
      fetchClass: "error",
      isHtml: false,
      wordCount: 0,
    });
  });
});
