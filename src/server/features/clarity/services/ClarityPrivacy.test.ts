import { describe, expect, it } from "vitest";
import {
  CLARITY_URL_JOIN_KEY,
  prepareClarityResponseForCache,
  privacySafeClarityUrl,
  sanitizeClarityResponse,
} from "@/server/features/clarity/services/ClarityPrivacy";

describe("Clarity privacy sanitization", () => {
  it("removes query strings and fragments from absolute and relative URLs", () => {
    expect(
      privacySafeClarityUrl(
        "https://example.com/account?email=user%40example.com#token",
      ),
    ).toBe("https://example.com/account");
    expect(privacySafeClarityUrl("/checkout?customer=123#payment")).toBe(
      "/checkout",
    );
  });

  it("sanitizes URL dimensions and URL-shaped referrer values", () => {
    const sanitized = sanitizeClarityResponse([
      {
        metricName: "Traffic",
        information: [
          {
            Url: "https://example.com/page?email=private@example.com#secret",
            totalSessionCount: "2",
          },
        ],
      },
      {
        metricName: "ReferrerUrl",
        information: [
          {
            name: "https://referrer.example/path?campaign=private#fragment",
            sessionsCount: "1",
          },
          {
            name: "referrer.example/path?email=private@example.com#fragment",
            sessionsCount: "2",
          },
          {
            name: "/internal?customer=private#fragment",
            sessionsCount: "3",
          },
        ],
      },
    ]);

    expect(sanitized).toEqual([
      {
        metricName: "Traffic",
        information: [
          {
            Url: "https://example.com/page",
            openSeoUrlJoinKey: "url-000001",
            totalSessionCount: "2",
          },
        ],
      },
      {
        metricName: "ReferrerUrl",
        information: [
          { name: "https://referrer.example/path", sessionsCount: "1" },
          { name: "referrer.example/path", sessionsCount: "2" },
          { name: "/internal", sessionsCount: "3" },
        ],
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("private");
  });

  it("keeps URL variants joinable without persisting their sensitive parts", () => {
    const sanitized = sanitizeClarityResponse([
      {
        metricName: "Traffic",
        information: [
          {
            Url: "https://example.com/page?campaign=private-a#one",
            totalSessionCount: "7",
          },
          {
            Url: "https://example.com/page?campaign=private-b#two",
            totalSessionCount: "3",
          },
        ],
      },
      {
        metricName: "EngagementTime",
        information: [
          {
            Url: "https://example.com/page?campaign=private-b#two",
            activeTime: "2",
          },
          {
            Url: "https://example.com/page?campaign=private-a#one",
            activeTime: "5",
          },
        ],
      },
    ]);

    const [trafficA, trafficB] = sanitized[0].information;
    const [engagementB, engagementA] = sanitized[1].information;
    expect(trafficA?.Url).toBe("https://example.com/page");
    expect(trafficB?.Url).toBe("https://example.com/page");
    expect(trafficA?.[CLARITY_URL_JOIN_KEY]).toBe(
      engagementA?.[CLARITY_URL_JOIN_KEY],
    );
    expect(trafficB?.[CLARITY_URL_JOIN_KEY]).toBe(
      engagementB?.[CLARITY_URL_JOIN_KEY],
    );
    expect(trafficA?.[CLARITY_URL_JOIN_KEY]).not.toBe(
      trafficB?.[CLARITY_URL_JOIN_KEY],
    );
    expect(
      sanitizeClarityResponse(sanitized, { preserveJoinKeys: true }),
    ).toEqual(sanitized);
    expect(JSON.stringify(sanitized)).not.toContain("private-");
  });

  it("bounds cache JSON below the D1 row limit and records original row counts", () => {
    const response = Array.from({ length: 9 }, (_metric, metricIndex) => ({
      metricName: `Metric${metricIndex}`,
      information: Array.from({ length: 1_000 }, (_row, rowIndex) => ({
        Url: `https://example.com/${metricIndex}/${rowIndex}?private=value`,
        name: "x".repeat(512),
      })),
    }));

    const prepared = prepareClarityResponseForCache(response);
    expect(
      new TextEncoder().encode(JSON.stringify(prepared)).length,
    ).toBeLessThanOrEqual(1_500_000);
    expect(prepared.some((metric) => metric.information.length < 1_000)).toBe(
      true,
    );
    expect(
      prepared.every(
        (metric) => metric.openSeoOriginalInformationRows === 1_000,
      ),
    ).toBe(true);
    expect(JSON.stringify(prepared)).not.toContain("?private=value");
  });
});
