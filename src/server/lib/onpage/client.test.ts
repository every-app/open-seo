import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/server/features/content-optimization/repositories/OnPageConnectionRepository",
  () => ({
    OnPageConnectionRepository: {
      getState: vi.fn(async () => ({ apiKey: null, enabled: true })),
      getApiKey: vi.fn(async () => null),
      saveApiKey: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => undefined),
    },
  }),
);

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(async (name: string) =>
    name === "ONPAGE_API_KEY" ? "op_test_key" : undefined,
  ),
}));

import {
  createContentScan,
  getContentScanJob,
  getContentScanReport,
  OnPageApiError,
  onPageReportSchema,
} from "./client";

const MINIMAL_REPORT = {
  meta: {
    report_date: "2026-07-22",
    target_keyword: "seo api",
    location: "United States",
    url: "https://example.com/page",
  },
  on_page_optimization: {
    score: 62,
    grade: "Good",
    confidence: 0.9,
    summary: "Covers the basics; entity gaps remain.",
    focus_areas: ["Add missing entities"],
    algorithm_version: "onpage-optimization-score-v1.1",
    chart: null,
  },
  benchmarks: {
    page1_average: benchmark(1450),
    your_url: benchmark(900),
    chart: null,
  },
  entity_coverage: {
    your_url_related_entity_density_score: 4.1,
    competitor_related_entity_density_score: 6.8,
    natural_language_entities: [
      { entity: "crawl budget", importance: 9, coverage_status: "missing" },
      { entity: "sitemap", importance: 7, coverage_status: "good" },
    ],
    highly_related_terms: [
      { entity: "indexing", coverage_status: "present_not_entity" },
    ],
    keyword_variations: [{ variation: "seo apis", coverage_status: "missing" }],
    related_category_entities: [],
    specific_category_entities: [],
    chart_density_gap: null,
    chart_coverage_status: null,
    chart_top_missing: null,
  },
  topic_and_classification: {
    page_classification: [],
    swipe_content: {
      suggested_title: "SEO API: the complete guide",
      topic_coverage: ["Rate limits"],
      read_before: [],
    },
    topical_authority_questions: { what: ["What is an SEO API?"] },
    chart: null,
  },
  internal_linking: {
    add_internal_links_from: ["https://example.com/blog"],
    to_your_url: "https://example.com/page",
  },
  competitor_term_coverage: {
    domains: ["a.com"],
    terms: [
      {
        keyword: "endpoints",
        importance: 5,
        your_url_count: 1,
        competitor_counts: [4, 6],
      },
    ],
  },
  schema_version: "onpage-report-customer-v1",
  jobDisplayId: "OP-1234",
  poweredBy: "On-Page.ai",
};

function benchmark(words: number) {
  return {
    word_count: words,
    h1_count: 1,
    h2_count: 6,
    h3_count: 4,
    h4_count: 0,
    image_count: 3,
    entity_count: 40,
    entity_density: 2.2,
    keyword_variation_count: 5,
    keyword_variation_density: 0.4,
    related_category_entity_count: 12,
    related_category_density: 0.9,
  };
}

function mockFetchOnce(status: number, body: unknown) {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createContentScan", () => {
  it("returns the job id and sends the bearer key", async () => {
    const fetchMock = mockFetchOnce(202, {
      job_id: "job-1",
      jobId: "job-1",
      status: "queued",
    });
    const result = await createContentScan({
      url: "https://example.com",
      keyword: "seo api",
    });
    expect(result).toEqual({ jobId: "job-1" });
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.on-page.ai/v1/scan");
    expect(new Headers(call?.[1]?.headers).get("Authorization")).toBe(
      "Bearer op_test_key",
    );
  });

  it("maps insufficient credits to a clear error", async () => {
    mockFetchOnce(402, { error: { code: "INSUFFICIENT_CREDITS" } });
    await expect(
      createContentScan({ url: "https://example.com", keyword: "x" }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it("rejects unexpected response shapes", async () => {
    mockFetchOnce(200, { unexpected: true });
    await expect(
      createContentScan({ url: "https://example.com", keyword: "x" }),
    ).rejects.toBeInstanceOf(OnPageApiError);
  });
});

describe("getContentScanJob", () => {
  it("parses running status with progress", async () => {
    mockFetchOnce(200, {
      job_id: "job-1",
      status: "running",
      progress: 40,
      error: null,
    });
    const status = await getContentScanJob("job-1");
    expect(status.status).toBe("running");
    expect(status.progress).toBe(40);
  });

  it("parses failed status with error details", async () => {
    mockFetchOnce(200, {
      job_id: "job-1",
      status: "failed",
      error: { code: "SCAN_FAILED", message: "Target unreachable." },
    });
    const status = await getContentScanJob("job-1");
    expect(status.status).toBe("failed");
    expect(status.error?.message).toBe("Target unreachable.");
  });
});

describe("getContentScanReport", () => {
  it("accepts a customer-v1 report and strips unknown sections", async () => {
    mockFetchOnce(200, { ...MINIMAL_REPORT, future_section: { ok: true } });
    const report = await getContentScanReport("job-1");
    expect(report.on_page_optimization.score).toBe(62);
    expect(report.entity_coverage.natural_language_entities).toHaveLength(2);
    // Unknown sections are dropped so the result stays serializable across
    // the server function boundary.
    expect((report as Record<string, unknown>).future_section).toBeUndefined();
  });

  it("signals not-ready results distinctly", async () => {
    mockFetchOnce(409, { error: { code: "RESULT_NOT_READY" } });
    await expect(getContentScanReport("job-1")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("onPageReportSchema", () => {
  it("validates the minimal report fixture", () => {
    expect(onPageReportSchema.safeParse(MINIMAL_REPORT).success).toBe(true);
  });

  it("defaults your_page to null for reports stored before the field existed", () => {
    const parsed = onPageReportSchema.parse(MINIMAL_REPORT);
    expect(parsed.topic_and_classification.your_page).toBeNull();
  });

  it("carries the scanned page's own category when present", () => {
    const parsed = onPageReportSchema.parse({
      ...MINIMAL_REPORT,
      topic_and_classification: {
        ...MINIMAL_REPORT.topic_and_classification,
        your_page: {
          category: "/Internet & Telecom/Web Services",
          confidence: 87,
        },
      },
    });
    expect(parsed.topic_and_classification.your_page?.category).toBe(
      "/Internet & Telecom/Web Services",
    );
  });

  it("rejects a report missing entity coverage", () => {
    const { entity_coverage: _dropped, ...rest } = MINIMAL_REPORT;
    expect(onPageReportSchema.safeParse(rest).success).toBe(false);
  });
});
