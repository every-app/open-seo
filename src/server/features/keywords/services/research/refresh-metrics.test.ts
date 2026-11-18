import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshSavedKeywordMetrics } from "./refresh-metrics";

const mocks = vi.hoisted(() => ({
  listSavedKeywordsByProject: vi.fn(),
  upsertKeywordMetric: vi.fn(),
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
  createDataforseoClient: vi.fn(),
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

const customer = { organizationId: "org", userId: "user", userEmail: "u@x" };

function savedRow(id: string, keyword: string) {
  return { row: { id, keyword, locationCode: 2840, languageCode: "en" } };
}

describe("refreshSavedKeywordMetrics", () => {
  beforeEach(() => {
    mocks.listSavedKeywordsByProject.mockResolvedValue({
      rows: [savedRow("a", "old keyword"), savedRow("b", "imported keyword")],
    });
    mocks.fetchKeywordMetricsForList.mockResolvedValue([]);
  });

  it("fetches, and bills, only the given saved keywords", async () => {
    await refreshSavedKeywordMetrics(
      { projectId: "p", savedKeywordIds: ["b", "not-in-project"] },
      customer,
    );

    expect(mocks.fetchKeywordMetricsForList).toHaveBeenCalledTimes(1);
    expect(mocks.fetchKeywordMetricsForList).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ keywords: ["imported keyword"] }),
    );
  });
});
