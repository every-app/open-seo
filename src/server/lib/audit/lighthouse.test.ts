import { afterEach, describe, expect, it, vi } from "vitest";

const createDataforseoClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: createDataforseoClientMock,
}));

vi.mock("@/server/lib/r2", () => ({
  putTextToR2: vi.fn(),
}));

import { fetchLighthouseResult, selectLighthouseSample } from "./lighthouse";

afterEach(() => {
  vi.clearAllMocks();
});

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

  it("does not sample another page from the start page's template", () => {
    const selected = selectLighthouseSample(
      [
        { url: "https://example.com/products/123", statusCode: 200 },
        { url: "https://example.com/products/456", statusCode: 200 },
        { url: "https://example.com/about", statusCode: 200 },
      ],
      "https://example.com/products/123",
      "auto",
    );

    expect(selected).toEqual([
      "https://example.com/products/123",
      "https://example.com/about",
    ]);
  });
});

describe("fetchLighthouseResult", () => {
  const billingCustomer = {
    userId: "user-1",
    userEmail: "test@example.com",
    organizationId: "org-1",
  };

  it("does not retry an ambiguous generic failure", async () => {
    const live = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        scores: {
          performance: 90,
          accessibility: 91,
          "best-practices": 92,
          seo: 93,
        },
        metrics: {
          largestContentfulPaint: { numericValue: 1000 },
          cumulativeLayoutShift: { numericValue: 0.01 },
          interactionToNextPaint: { numericValue: 100 },
          serverResponseTime: { numericValue: 200 },
        },
      });
    createDataforseoClientMock.mockReturnValue({
      lighthouse: { live },
    });

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "desktop",
      billingCustomer,
    );

    expect(live).toHaveBeenCalledOnce();
    expect(fetched.result.errorMessage).toBe("temporary failure");
  });
});
