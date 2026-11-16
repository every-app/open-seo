import { describe, expect, it } from "vitest";
import { platformDomain } from "./platformDomain";

const fromUrl = (url: string) => platformDomain({ url });

describe("platformDomain", () => {
  it("collapses a normal site's subdomains into the platform", () => {
    expect(fromUrl("https://jane.medium.com/post")).toBe("medium.com");
    expect(fromUrl("https://www.reddit.com/r/seo")).toBe("reddit.com");
  });

  it("files a big company's domain by subdomain or product section", () => {
    expect(fromUrl("https://sites.google.com/view/acme")).toBe(
      "sites.google.com",
    );
    expect(fromUrl("https://docs.google.com/document/d/abc/edit")).toBe(
      "docs.google.com",
    );
    expect(fromUrl("https://www.google.com/maps/place/Acme")).toBe(
      "google.com/maps",
    );
    expect(fromUrl("https://podcasts.apple.com/us/podcast/x/id1")).toBe(
      "podcasts.apple.com",
    );
    expect(fromUrl("https://www.amazon.co.uk/stores/Acme/page/1")).toBe(
      "amazon.co.uk/stores",
    );
    // Locales and product slugs are skipped to reach the section.
    expect(fromUrl("https://www.amazon.com/Acme-Widget-Pro-Max/dp/B0X")).toBe(
      "amazon.com/dp",
    );
    expect(fromUrl("https://www.amazon.com/Kindle-Paperwhite/dp/B08K")).toBe(
      "amazon.com/dp",
    );
    expect(fromUrl("https://www.google.com/intl/en/chrome/")).toBe(
      "google.com/chrome",
    );
    expect(fromUrl("https://www.apple.com/")).toBe("apple.com");
    expect(fromUrl("https://apple.news/AbC12xYz9")).toBe("apple.news");
    expect(fromUrl("https://cylex.us.com/company/x")).toBe("cylex.us.com");
  });

  it("keeps the subdomain when DataForSEO gives only a domain", () => {
    expect(platformDomain({ domain: "support.google.com" })).toBe(
      "support.google.com",
    );
  });
});
