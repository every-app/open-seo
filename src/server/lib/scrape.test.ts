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

describe("discoverSiteUrls Firecrawl dedup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("dedupes canonical-equivalent /map URLs and homepage variants", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("api.firecrawl.dev/v2/map")) {
        return Promise.resolve(
          Response.json({
            success: true,
            links: [
              { url: "https://example.com/about" },
              // www variant of /about — same canonical key, must be dropped.
              { url: "https://www.example.com/about" },
              { url: "https://example.com/pricing" },
              // www variant of the homepage — must not be scraped twice.
              { url: "https://www.example.com/" },
            ],
          }),
        );
      }
      // DoH lookups and anything else: reject; url-policy fails open on DNS.
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const result = await discoverSiteUrls("example.com", 5);

    expect(result).toEqual({
      urls: [
        "https://example.com/",
        "https://example.com/about",
        "https://example.com/pricing",
      ],
      blocked: false,
    });
  });
});

describe("readSite Firecrawl circuit breaker", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shares the breaker: a /map failure stops readPages retrying Firecrawl", async () => {
    let scrapeCalls = 0;
    vi.mocked(fetch).mockImplementation((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("api.firecrawl.dev/v2/map")) {
        return Promise.reject(new Error("firecrawl down"));
      }
      if (url.includes("api.firecrawl.dev/v2/scrape")) {
        scrapeCalls += 1;
        return Promise.reject(new Error("firecrawl down"));
      }
      if (url.endsWith("/sitemap.xml")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      if (url === "https://example.com/") {
        return Promise.resolve(
          new Response(
            "<html><head><title>Example</title></head>" +
              "<body>hello from plain fetch</body></html>",
          ),
        );
      }
      // DoH lookups and anything else: reject; url-policy fails open on DNS.
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const result = await readSite("example.com", 2);

    expect(result.blocked).toBe(false);
    expect(result.pages).toEqual([
      {
        url: "https://example.com/",
        title: "Example",
        text: "Example hello from plain fetch",
      },
    ]);
    // The /map failure tripped the shared breaker, so readPages must not have
    // attempted Firecrawl at all.
    expect(scrapeCalls).toBe(0);
  });
});
