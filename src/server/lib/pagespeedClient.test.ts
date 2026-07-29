import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn().mockResolvedValue("psi_key"),
  getRequiredEnvValue: vi.fn().mockResolvedValue("psi_key"),
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/** The client always calls fetch with a string URL; narrow accordingly. */
function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

type PsiFixture = {
  lighthouseResult: {
    fetchTime: string;
    categories: Record<string, { score: number | null }>;
    audits: Record<string, { numericValue: number }>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile: number; category: string }>;
    overall_category?: string;
    origin_fallback?: boolean;
  };
};

/** A response with lab data, field data, and every metric populated. */
function fullResponse(): PsiFixture {
  return {
    lighthouseResult: {
      fetchTime: "2026-07-29T10:00:00.000Z",
      categories: {
        performance: { score: 0.85 },
        accessibility: { score: 0.92 },
        "best-practices": { score: 1 },
        seo: { score: 0.9 },
      },
      audits: {
        "largest-contentful-paint": { numericValue: 2500.4 },
        "cumulative-layout-shift": { numericValue: 0.05 },
        "total-blocking-time": { numericValue: 210 },
        "first-contentful-paint": { numericValue: 1200 },
        "speed-index": { numericValue: 3000 },
        "server-response-time": { numericValue: 300 },
        // An audit the client does not read; must be ignored, not rejected.
        "unused-javascript": { numericValue: 999 },
      },
    },
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100, category: "AVERAGE" },
        INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: "FAST" },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
      },
      overall_category: "AVERAGE",
    },
  };
}

describe("pagespeed client", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests all four categories as repeated params with the key and strategy", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(fullResponse()));
    const { createPagespeedClient } = await import("./pagespeedClient");

    await createPagespeedClient().runPagespeed({
      url: "https://example.com/",
      strategy: "desktop",
    });

    const url = new URL(fetchUrl(mocks.fetch.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    expect(url.searchParams.get("url")).toBe("https://example.com/");
    expect(url.searchParams.get("strategy")).toBe("desktop");
    expect(url.searchParams.get("key")).toBe("psi_key");
    expect(url.searchParams.getAll("category")).toEqual([
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]);
  });

  it("flattens scores, lab metrics and field data", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(fullResponse()));
    const { createPagespeedClient } = await import("./pagespeedClient");

    const result = await createPagespeedClient().runPagespeed({
      url: "https://example.com/",
      strategy: "mobile",
    });

    expect(result).toEqual({
      performanceScore: 85,
      accessibilityScore: 92,
      bestPracticesScore: 100,
      seoScore: 90,
      lcpMs: 2500.4,
      cls: 0.05,
      tbtMs: 210,
      fcpMs: 1200,
      speedIndexMs: 3000,
      ttfbMs: 300,
      fieldLcpMs: 2100,
      fieldInpMs: 180,
      // CrUX reports the CLS percentile x100.
      fieldCls: 0.05,
      fieldOverallCategory: "AVERAGE",
      fieldSource: "url",
      fetchTime: "2026-07-29T10:00:00.000Z",
    });
  });

  it("nulls every field metric when CrUX has no data for the URL", async () => {
    const body = fullResponse();
    delete body.loadingExperience;
    mocks.fetch.mockResolvedValue(jsonResponse(body));
    const { createPagespeedClient } = await import("./pagespeedClient");

    const result = await createPagespeedClient().runPagespeed({
      url: "https://example.com/",
      strategy: "mobile",
    });

    expect(result.fieldLcpMs).toBeNull();
    expect(result.fieldInpMs).toBeNull();
    expect(result.fieldCls).toBeNull();
    expect(result.fieldOverallCategory).toBeNull();
    expect(result.fieldSource).toBeNull();
    // Lab data still lands.
    expect(result.performanceScore).toBe(85);
  });

  it("marks origin_fallback data as origin-sourced", async () => {
    const body = fullResponse();
    body.loadingExperience = {
      ...body.loadingExperience,
      origin_fallback: true,
    };
    mocks.fetch.mockResolvedValue(jsonResponse(body));
    const { createPagespeedClient } = await import("./pagespeedClient");

    const result = await createPagespeedClient().runPagespeed({
      url: "https://example.com/deep-page",
      strategy: "mobile",
    });

    expect(result.fieldSource).toBe("origin");
    expect(result.fieldLcpMs).toBe(2100);
  });

  it("treats a NONE verdict as no verdict", async () => {
    const body = fullResponse();
    body.loadingExperience = {
      ...body.loadingExperience,
      overall_category: "NONE",
    };
    mocks.fetch.mockResolvedValue(jsonResponse(body));
    const { createPagespeedClient } = await import("./pagespeedClient");

    const result = await createPagespeedClient().runPagespeed({
      url: "https://example.com/",
      strategy: "mobile",
    });

    expect(result.fieldOverallCategory).toBeNull();
  });

  it("nulls a category Lighthouse could not compute", async () => {
    const body = fullResponse();
    body.lighthouseResult.categories = {
      ...body.lighthouseResult.categories,
      performance: { score: null },
    };
    mocks.fetch.mockResolvedValue(jsonResponse(body));
    const { createPagespeedClient } = await import("./pagespeedClient");

    const result = await createPagespeedClient().runPagespeed({
      url: "https://example.com/",
      strategy: "mobile",
    });

    expect(result.performanceScore).toBeNull();
    expect(result.seoScore).toBe(90);
  });

  it("maps quota and key failures to expected errors", async () => {
    const {
      createPagespeedClient,
      isExpectedPagespeedFailure,
      PagespeedApiError,
    } = await import("./pagespeedClient");

    for (const status of [400, 403, 429]) {
      mocks.fetch.mockResolvedValue(
        jsonResponse({ error: { code: status } }, status),
      );
      const error = await createPagespeedClient()
        .runPagespeed({ url: "https://example.com/", strategy: "mobile" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PagespeedApiError);
      expect(isExpectedPagespeedFailure(error)).toBe(true);
    }
  });

  it("treats a server error as unexpected", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: {} }, 503));
    const { createPagespeedClient, isExpectedPagespeedFailure } =
      await import("./pagespeedClient");

    const error = await createPagespeedClient()
      .runPagespeed({ url: "https://example.com/", strategy: "mobile" })
      .catch((e: unknown) => e);

    expect(isExpectedPagespeedFailure(error)).toBe(false);
  });

  it("names the env var in the rejected-key message", async () => {
    const { messageForStatus } = await import("./pagespeedClient");

    expect(messageForStatus(403, "")).toContain("PAGESPEED_API_KEY");
    expect(messageForStatus(429, "")).toContain("quota");
  });
});
