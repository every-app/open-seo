import { describe, expect, it, vi } from "vitest";

vi.mock("@/serverFunctions/billing", () => ({
  getBillingUsageEvents: vi.fn(),
}));

import { getBillingFeatureBreakdownRows } from "./BillingFeatureBreakdown";

describe("getBillingFeatureBreakdownRows", () => {
  it("prefers an explicit creditFeature (or its raw alias) over the path", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        timestamp: 0,
        value: 250,
        properties: {
          creditFeature: "rank_tracking",
          paths: ["v3/serp/google/organic/live/regular"],
        },
      },
      {
        timestamp: 0,
        value: 200,
        properties: {
          credit_feature: "local_seo",
          path: "v3/backlinks/summary/live",
        },
      },
    ]);

    expect(rows).toEqual([
      { label: "Rank Tracking", usd: 0.25 },
      { label: "Local SEO", usd: 0.2 },
    ]);
  });

  it("infers legacy events from DataForSEO paths", () => {
    const rows = getBillingFeatureBreakdownRows([
      {
        timestamp: 0,
        value: 500,
        properties: { paths: ["v3/backlinks/summary/live"] },
      },
      {
        timestamp: 0,
        value: 250,
        properties: {
          paths: ["v3/dataforseo_labs/google/domain_rank_overview/live"],
        },
      },
      {
        timestamp: 0,
        value: 125,
        properties: {
          paths: ["v3/ai_optimization/llm_mentions/search/live"],
        },
      },
      {
        timestamp: 0,
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
        timestamp: 0,
        value: 300,
        properties: {
          paths: '["v3/ai_optimization/chat_gpt/llm_responses/live"]',
        },
      },
      {
        timestamp: 0,
        value: 200,
        properties: {
          paths: '["v3","ai_optimization","perplexity","llm_responses","live"]',
        },
      },
    ]);

    expect(rows).toEqual([{ label: "AI Prompt Responses", usd: 0.5 }]);
  });
});
