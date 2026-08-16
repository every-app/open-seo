import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  putTextToR2: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => ({ route: mocks.route }),
}));
vi.mock("@/server/lib/r2", () => ({
  putTextToR2: mocks.putTextToR2,
}));

import { selectLighthouseSample, fetchAndStoreLighthouseResult } from "./lighthouse";

const billingCustomer = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "user@example.com",
};

const lighthousePayload = {
  scores: {
    performance: 0.87,
    accessibility: 0.92,
    "best-practices": 0.95,
    seo: 1,
  },
  metrics: {
    largestContentfulPaint: { numericValue: 2200 },
    cumulativeLayoutShift: { numericValue: 0.02 },
    interactionToNextPaint: { numericValue: 300 },
    serverResponseTime: { numericValue: 450 },
  },
};

describe("selectLighthouseSample", () => {
  it("includes a start page reached through a trailing-slash redirect", () => {
    const pages = [
      ...Array.from({ length: 10 }, (_, index) => ({
        url: `https://example.com/section${index}`,
        statusCode: 200,
      })),
      { url: "https://example.com/services/", statusCode: 200 },
    ];

    const selected = selectLighthouseSample(
      pages,
      "https://example.com/services",
      "auto",
    );

    expect(selected).toHaveLength(10);
    expect(selected[0]).toBe("https://example.com/services/");
  });

  it("prefers an exact start page when both slash forms return 2xx", () => {
    const selected = selectLighthouseSample(
      [
        { url: "https://example.com/services/", statusCode: 200 },
        { url: "https://example.com/services", statusCode: 200 },
      ],
      "https://example.com/services",
      "auto",
    );

    expect(selected[0]).toBe("https://example.com/services");
  });
});

describe("fetchAndStoreLighthouseResult", () => {
  beforeEach(() => {
    mocks.route.mockReset();
    mocks.putTextToR2.mockReset();
  });

  it("routes through the seo data router, maps scores, and writes the payload to R2", async () => {
    mocks.route.mockResolvedValue({
      data: lighthousePayload,
      provider: "dataforseo",
      fromCache: false,
    });
    mocks.putTextToR2.mockResolvedValue({
      key: "site-audit/project_1/audit_1/page_1-mobile.json",
      sizeBytes: 1024,
    });

    const result = await fetchAndStoreLighthouseResult({
      url: "https://acme.com/",
      pageId: "page_1",
      strategy: "mobile",
      billingCustomer,
      projectId: "project_1",
      auditId: "audit_1",
    });

    expect(mocks.route).toHaveBeenCalledTimes(1);
    expect(mocks.route).toHaveBeenCalledWith({
      dataType: "site_audit",
      url: "https://acme.com/",
      device: "mobile",
      billingCustomer,
      constraints: { lighthouse: true },
    });
    expect(mocks.putTextToR2).toHaveBeenCalledTimes(1);
    expect(mocks.putTextToR2).toHaveBeenCalledWith(
      "site-audit/project_1/audit_1/page_1-mobile.json",
      JSON.stringify(lighthousePayload),
    );
    expect(result).toEqual({
      url: "https://acme.com/",
      pageId: "page_1",
      strategy: "mobile",
      performanceScore: 0.87,
      accessibilityScore: 0.92,
      bestPracticesScore: 0.95,
      seoScore: 1,
      lcpMs: 2200,
      cls: 0.02,
      inpMs: 300,
      ttfbMs: 450,
      r2Key: "site-audit/project_1/audit_1/page_1-mobile.json",
      payloadSizeBytes: 1024,
    });
  });

  it("uses the desktop strategy when requested", async () => {
    mocks.route.mockResolvedValue({
      data: lighthousePayload,
      provider: "cache",
      fromCache: true,
    });
    mocks.putTextToR2.mockResolvedValue({
      key: "site-audit/project_1/audit_1/page_1-desktop.json",
      sizeBytes: 512,
    });

    await fetchAndStoreLighthouseResult({
      url: "https://acme.com/",
      pageId: "page_1",
      strategy: "desktop",
      billingCustomer,
      projectId: "project_1",
      auditId: "audit_1",
    });

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({ device: "desktop" }),
    );
    expect(mocks.putTextToR2).toHaveBeenCalledWith(
      "site-audit/project_1/audit_1/page_1-desktop.json",
      expect.any(String),
    );
  });

  it("returns a null-score result without storing anything when the router fails", async () => {
    mocks.route.mockRejectedValue(new Error("upstream unavailable"));

    const result = await fetchAndStoreLighthouseResult({
      url: "https://acme.com/",
      pageId: "page_1",
      strategy: "mobile",
      billingCustomer,
      projectId: "project_1",
      auditId: "audit_1",
    });

    expect(mocks.putTextToR2).not.toHaveBeenCalled();
    expect(result).toEqual({
      url: "https://acme.com/",
      pageId: "page_1",
      strategy: "mobile",
      performanceScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      seoScore: null,
      lcpMs: null,
      cls: null,
      inpMs: null,
      ttfbMs: null,
      errorMessage: "upstream unavailable",
    });
  });
});