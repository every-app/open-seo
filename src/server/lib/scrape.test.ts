import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverSiteUrls, readPages, readSite } from "@/server/lib/scrape";

describe("readSite SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks a metadata/private host without fetching it", async () => {
    const result = await readSite("169.254.169.254");

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // The blocked host must be rejected before any outbound page fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks localhost-style targets", async () => {
    const result = await readSite("localhost:3000");

    expect(result.blocked).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("readPages SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips private/metadata URLs without fetching them", async () => {
    const result = await readPages([
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/admin",
    ]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // Every URL is validated before any outbound fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns blocked for an empty URL list without fetching", async () => {
    const result = await readPages([]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

const sitemap = (...locs: string[]) =>
  `<?xml version="1.0"?><urlset>${locs.map((loc) => `<loc>${loc}</loc>`).join("")}</urlset>`;

describe("discoverSiteUrls sitemap origin check", () => {
  const serveSitemap = (xml: string) =>
    vi.fn(
      async () =>
        new Response(xml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops <loc> entries that only share a prefix with the origin", async () => {
    vi.stubGlobal(
      "fetch",
      serveSitemap(
        sitemap(
          "https://example.com/keep",
          "https://example.com.attacker.test/steal",
          "https://example.combo.test/steal",
          "https://example.com:8443/steal",
        ),
      ),
    );

    const { urls } = await discoverSiteUrls("example.com", 10);

    expect(urls).toEqual(["https://example.com/", "https://example.com/keep"]);
  });

  it("keeps relative and absolute same-origin entries", async () => {
    vi.stubGlobal(
      "fetch",
      serveSitemap(sitemap("/about", "https://example.com/pricing")),
    );

    const { urls } = await discoverSiteUrls("example.com", 10);

    expect(urls).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
    ]);
  });

  it("still skips nested sitemap files", async () => {
    vi.stubGlobal(
      "fetch",
      serveSitemap(
        sitemap(
          "https://example.com/sitemap-posts.xml",
          "https://example.com/a",
        ),
      ),
    );

    const { urls } = await discoverSiteUrls("example.com", 10);

    expect(urls).toEqual(["https://example.com/", "https://example.com/a"]);
  });
});
