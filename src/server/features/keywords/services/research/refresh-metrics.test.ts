import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSavedKeywordsByProject: vi.fn(),
  upsertKeywordMetric: vi.fn(),
  createDataforseoClient: vi.fn(),
  fetchKeywordMetricsForList: vi.fn(),
}));

vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: {
      listSavedKeywordsByProject: mocks.listSavedKeywordsByProject,
      upsertKeywordMetric: mocks.upsertKeywordMetric,
    },
  }),
);

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

import { refreshSavedKeywordMetrics } from "@/server/features/keywords/services/research/refresh-metrics";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userEmail: "test@example.com",
  userId: "user_1",
};

const savedRow = (keyword: string) => ({
  row: { keyword, locationCode: 2840, languageCode: "en" },
});

const metric = (keyword: string) => ({
  keyword,
  searchVolume: 100,
  cpc: 1,
  competition: 0.5,
  competitionLevel: "MEDIUM",
  keywordDifficulty: 10,
  intent: "informational",
  monthlySearches: [],
});

describe("refreshSavedKeywordMetrics", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createDataforseoClient.mockReturnValue({});
    mocks.upsertKeywordMetric.mockResolvedValue(undefined);
  });

  it("counts saved keywords actually written, not provider metrics returned", async () => {
    mocks.listSavedKeywordsByProject.mockResolvedValue({
      rows: [savedRow("café noir"), savedRow("green tea")],
    });
    mocks.fetchKeywordMetricsForList.mockResolvedValue([
      metric("cafe noir"),
      metric("green tea"),
    ]);

    const result = await refreshSavedKeywordMetrics(
      { projectId: "project_1" },
      billingCustomer,
    );

    expect(mocks.upsertKeywordMetric).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updated: 1 });
  });

  it("reports zero when no saved keyword matches a returned metric", async () => {
    mocks.listSavedKeywordsByProject.mockResolvedValue({
      rows: [savedRow("café noir")],
    });
    mocks.fetchKeywordMetricsForList.mockResolvedValue([metric("cafe noir")]);

    const result = await refreshSavedKeywordMetrics(
      { projectId: "project_1" },
      billingCustomer,
    );

    expect(mocks.upsertKeywordMetric).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0 });
  });
});
