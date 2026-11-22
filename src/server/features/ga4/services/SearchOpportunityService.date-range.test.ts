import { afterEach, expect, it, vi } from "vitest";
import { SearchOpportunityService } from "./SearchOpportunityService";
import { makeGa4Connection } from "./ga4-test-fixtures";
import type { GscSearchAnalyticsRequest } from "@/server/lib/gscClient";
import type { Ga4RunReportRequest } from "@/server/lib/ga4Client";

const mocks = vi.hoisted(() => ({
  googleSearch: vi.fn(
    async (_site: string, _request: GscSearchAnalyticsRequest) => [],
  ),
  googleAnalytics: vi.fn(async (_request: Ga4RunReportRequest) => ({})),
  ga4Connection: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    getByProjectId: async () => ({ siteUrl: "https://example.com/" }),
  },
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.ga4Connection },
}));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: () => ({ querySearchAnalytics: mocks.googleSearch }),
}));
vi.mock("@/server/lib/ga4Client", () => ({
  createGa4DataClient: () => ({ runReport: mocks.googleAnalytics }),
}));

afterEach(() => vi.useRealTimers());

it("sends the same retained historical date range to Search Console and GA4", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
  mocks.ga4Connection.mockResolvedValue(makeGa4Connection());

  const result = await SearchOpportunityService.getOpportunities({
    projectId: "project_1",
    startDate: "2025-07-01",
    endDate: "2025-08-01",
  });

  const gscRequest = mocks.googleSearch.mock.calls[0][1];
  const ga4Range = mocks.googleAnalytics.mock.calls[0][0].dateRanges[0];
  const retainedRange = { startDate: "2025-07-21", endDate: "2025-08-01" };
  expect(gscRequest).toMatchObject(retainedRange);
  expect(ga4Range).toEqual(retainedRange);
  expect(result.request.dateRange).toEqual(retainedRange);
});
