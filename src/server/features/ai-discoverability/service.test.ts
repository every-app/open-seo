import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAiDiscoverability } from "./service";

vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: vi.fn(async (url: string) => url),
  resolveStartUrlRedirects: vi.fn(async (url: string) => url),
}));

afterEach(() => vi.unstubAllGlobals());

describe("checkAiDiscoverability", () => {
  it("separates robots permission from a hosting challenge", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          "User-agent: OAI-SearchBot\nAllow: /\nUser-agent: PerplexityBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml",
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("Challenge", {
          status: 403,
          headers: { "x-vercel-mitigated": "challenge" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkAiDiscoverability("https://example.com/");

    expect(
      result.robots.crawlers.find((c) => c.userAgent === "OAI-SearchBot")
        ?.allowed,
    ).toBe(true);
    expect(
      result.robots.crawlers.find((c) => c.userAgent === "PerplexityBot")
        ?.allowed,
    ).toBe(false);
    expect(result.robots.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(result.page.status).toBe(403);
    expect(result.page.challenge).toBe("challenge");
    expect(result.page.noindex).toBeNull();
  });

  it("reads page indexability and visible content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          '<html><head><title>Example</title><meta name="robots" content="noindex"></head><body><h1>Useful answer</h1><p>Helpful facts here.</p></body></html>',
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkAiDiscoverability("https://example.com/");

    expect(result.robots.crawlers.every((crawler) => crawler.allowed)).toBe(
      true,
    );
    expect(result.page.title).toBe("Example");
    expect(result.page.h1s).toEqual(["Useful answer"]);
    expect(result.page.noindex).toBe(true);
  });
});
