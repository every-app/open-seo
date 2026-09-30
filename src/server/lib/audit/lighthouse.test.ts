import { afterEach, describe, expect, it, vi } from "vitest";

const createDataforseoClientMock = vi.hoisted(() => vi.fn());
const fetchLocalLighthouseMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: createDataforseoClientMock,
}));

vi.mock("@/server/lib/localLighthouse", () => ({
  fetchLocalLighthouse: fetchLocalLighthouseMock,
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(async () => false),
  getOptionalEnvValue: vi.fn(async (name: string) => {
    if (name === "DATAFORSEO_API_KEY") return "configured";
    if (name === "LOCAL_LIGHTHOUSE_URL") return "http://lighthouse-runner:4181";
    return undefined;
  }),
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

  it("uses its own runner when a self-hosted instance has no DataForSEO key", async () => {
    const { getOptionalEnvValue } = await import("@/server/lib/runtime-env");
    vi.mocked(getOptionalEnvValue).mockImplementation(async (name: string) =>
      name === "LOCAL_LIGHTHOUSE_URL"
        ? "http://lighthouse-runner:4181"
        : undefined,
    );
    fetchLocalLighthouseMock.mockResolvedValueOnce({
      scores: {
        performance: 82,
        accessibility: 95,
        "best-practices": 91,
        seo: 100,
      },
      metrics: {
        largestContentfulPaint: { numericValue: 1700 },
        cumulativeLayoutShift: { numericValue: 0.02 },
        interactionToNextPaint: { numericValue: null },
        serverResponseTime: { numericValue: 190 },
      },
    });

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "mobile",
      billingCustomer,
    );

    expect(fetchLocalLighthouseMock).toHaveBeenCalledWith({
      url: "https://example.com/",
      strategy: "mobile",
      runnerUrl: "http://lighthouse-runner:4181",
    });
    expect(createDataforseoClientMock).not.toHaveBeenCalled();
    expect(fetched.result.performanceScore).toBe(82);
    expect(fetched.result.lcpMs).toBe(1700);
  });
});
