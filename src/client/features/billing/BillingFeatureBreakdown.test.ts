import { describe, expect, it, vi } from "vitest";

vi.mock("@/serverFunctions/billing", () => ({
  getBillingUsageEvents: vi.fn(),
}));

import { getBillingFeatureBreakdownRows } from "./BillingFeatureBreakdown";

describe("getBillingFeatureBreakdownRows", () => {
  it("uses explicit creditFeature when present", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        value: 250,
        properties: {
          creditFeature: "rank_tracking",
          paths: ["v3/serp/google/organic/live/regular"],
        },
      },
    ]);

    expect(rows).toEqual([{ label: "Rank Tracking", usd: 0.25 }]);
  });

  it("supports raw Autumn property aliases", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        value: 200,
        properties: {
          credit_feature: "local_seo",
          path: "v3/backlinks/summary/live",
        },
      },
    ]);

    expect(rows).toEqual([{ label: "Local SEO", usd: 0.2 }]);
  });

  it("infers legacy events from DataForSEO paths", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        value: 500,
        properties: { paths: ["v3/backlinks/summary/live"] },
      },
      {
        value: 250,
        properties: {
          paths: ["v3/dataforseo_labs/google/domain_rank_overview/live"],
        },
      },
      {
        value: 125,
        properties: {
          paths: ["v3/ai_optimization/llm_mentions/search/live"],
        },
      },
      {
        value: 100,
        properties: { paths: ["backlinks/summary"] },
      },
    ]);

    expect(rows).toEqual([
      { label: "Backlinks", usd: 0.6 },
      { label: "Domain Overview", usd: 0.25 },
      { label: "AI Citations", usd: 0.125 },
    ]);
  });

  it("supports legacy JSON-encoded path groups", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        value: 300,
        properties: {
          paths: '["v3/ai_optimization/chat_gpt/llm_responses/live"]',
        },
      },
      {
        value: 200,
        properties: {
          paths: '["v3","ai_optimization","perplexity","llm_responses","live"]',
        },
      },
    ]);

    expect(rows).toEqual([{ label: "AI Prompt Responses", usd: 0.5 }]);
  });

  it("falls back to Other when neither feature nor path is available", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        value: 100,
        properties: {},
      },
    ]);

    expect(rows).toEqual([{ label: "Other", usd: 0.1 }]);
  });
});
