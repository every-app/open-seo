import { describe, expect, it } from "vitest";
import {
  canonicalUrlKey,
  detectUrlTemplate,
  isAuditablePageUrl,
  isSameOrigin,
  normalizeUrl,
} from "@/server/lib/audit/url-utils";

describe("normalizeUrl", () => {
  it("normalizes host/query/hash, preserves trailing slash", () => {
    const value = normalizeUrl(
      "https://Example.COM/path/?b=2&a=1#section",
      "https://fallback.com",
    );

    expect(value).toBe("https://example.com/path/?a=1&b=2");
  });

  it("preserves a trailing slash on path-only URLs", () => {
    // A trailing slash is the canonical form on most CMSes; stripping it would
    // rewrite the canonical URL into its own redirect source and cause a loop.
    expect(normalizeUrl("https://example.com/services/")).toBe(
      "https://example.com/services/",
    );
  });

  it("returns null for unsupported protocol", () => {
    expect(normalizeUrl("mailto:test@example.com")).toBeNull();
  });
});

describe("canonicalUrlKey", () => {
  it.each(["https://www.example.com/", "http://example.com/"])(
    "treats %s as equal to https://example.com/",
    (url) => {
      expect(canonicalUrlKey(url)).toBe(
        canonicalUrlKey("https://example.com/"),
      );
    },
  );
});

describe("isSameOrigin", () => {
  it.each([
    ["https://www.example.com/products", "https://example.com", true],
    ["https://example.com/page", "http://example.com", true],
    ["https://example.org", "https://example.com", false],
  ])("isSameOrigin(%s, %s) is %s", (url, origin, expected) => {
    expect(isSameOrigin(url, origin)).toBe(expected);
  });
});

describe("detectUrlTemplate", () => {
  it("maps dynamic path segments", () => {
    expect(detectUrlTemplate("/blog/2026-03-01/my-great-post")).toBe(
      "/blog/:date/:slug",
    );
  });
});

describe("isAuditablePageUrl", () => {
  it.each([
    ["https://example.com/products/hat", undefined, true],
    [
      "https://example.com/cdn/shop/files/hat.jpg?v=1&width=1000",
      undefined,
      false,
    ],
    ["https://example.com/products/hat.json", undefined, false],
    ["https://example.com/report.pdf", undefined, true],
    [
      "https://example.com/en/customer_authentication/redirect?locale=en",
      "shopify",
      false,
    ],
    ["https://example.com/discount/SAVE10?redirect=%2F", "shopify", false],
    ["https://example.com/discount/SAVE10", undefined, true],
    ["https://example.com/en/collections/all?page=2", "shopify", true],
    ["https://example.com/cdn-cgi/l/email-protection", undefined, false],
  ] as const)("isAuditablePageUrl(%s, %s) is %s", (url, platform, expected) => {
    expect(isAuditablePageUrl(url, platform)).toBe(expected);
  });
});
