import { describe, expect, it } from "vitest";
import { createLocalCrawlerProvider } from "./local-crawler-provider";

const provider = createLocalCrawlerProvider();

const baseRequest = {
  dataType: "site_audit" as const,
  url: "https://example.com/",
  billingCustomer: {
    organizationId: "org_1",
    userId: "user_1",
    userEmail: "user@example.com",
  },
};

describe("local_crawler_provider.supports", () => {
  it("serves site_audit requests", () => {
    expect(provider.supports(baseRequest)).toBe(true);
  });

  it("refuses lighthouse-flagged requests so they fall through to DataForSEO", () => {
    expect(
      provider.supports({ ...baseRequest, constraints: { lighthouse: true } }),
    ).toBe(false);
  });

  it("does not serve other data types", () => {
    expect(provider.supports({ ...baseRequest, dataType: "serp" })).toBe(false);
  });
});