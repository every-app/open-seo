import { describe, expect, it, vi } from "vitest";
import { discoverUrls } from "@/server/lib/audit/discovery";

function sitemapXml(urls: string[]): string {
  const entries = urls.map((url) => `<url><loc>${url}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${entries}</urlset>`;
}

describe("discoverUrls", () => {
  // Seeding the frontier is what sets a page's in-sitemap flag, so a URL
  // dropped here reports inSitemap: false once the crawl reaches it through a
  // link. Real sitemaps bury the homepage in the middle of the list
  // (bannerbear.com lists it 387th of 1,328).
  it("returns sitemap URLs listed past the crawl's page budget", async () => {
    const posts = Array.from(
      { length: 5 },
      (_, index) => `https://example.com/blog/post-${index}/`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/robots.txt")
            ? new Response("User-agent: *\nAllow: /")
            : new Response(sitemapXml([...posts, "https://example.com/"]), {
                headers: { "content-type": "application/xml" },
              }),
        ),
      ),
    );

    const { urls } = await discoverUrls("https://example.com", 2);

    expect(urls).toContain("https://example.com/");
  });
});
