import { describe, expect, it } from "vitest";
import { crawlerResult, securityResult } from "./results";

const capabilities = {
  traffic: { available: true, reason: null },
  securityEvents: { available: true, reason: null },
  crawlerAccess: { available: true, reason: null },
};
const window = {
  from: "2026-09-03T12:00:00.000Z",
  to: "2026-09-04T12:00:00.000Z",
};

describe("Cloudflare Analytics privacy-safe aggregation", () => {
  it("coalesces security rows after identifiers are redacted", () => {
    const result = securityResult({
      rows: [
        {
          count: 2,
          dimensions: {
            action: "block",
            clientRequestHTTPHost: "Example.COM",
            clientRequestPath: "/reset/alice@example.com",
          },
        },
        {
          count: 3,
          dimensions: {
            action: "block",
            clientRequestHTTPHost: "Example.COM",
            clientRequestPath: "/reset/bob@example.com",
          },
        },
      ],
      errors: [],
      window,
      capabilities,
    });

    expect(result.data?.events).toEqual([
      {
        action: "block",
        source: null,
        ruleId: null,
        host: "example.com",
        pathname: "/reset/:redacted",
        count: 5,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/alice|bob/);
  });

  it("coalesces crawler rows after identifiers are redacted", () => {
    const result = crawlerResult({
      zone: {
        googlebot: [
          {
            count: 2,
            dimensions: {
              clientRequestHTTPHost: "example.com",
              clientRequestPath: "/users/12345678",
              edgeResponseStatus: 403,
            },
          },
          {
            count: 3,
            dimensions: {
              clientRequestHTTPHost: "example.com",
              clientRequestPath: "/users/87654321",
              edgeResponseStatus: 403,
            },
          },
        ],
        bingbot: [],
      },
      errors: [],
      window,
      capabilities,
    });

    expect(result.data?.crawlers[0]?.pages).toEqual([
      {
        host: "example.com",
        pathname: "/users/:redacted",
        status: 403,
        requests: 5,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/12345678|87654321/);
  });
});
