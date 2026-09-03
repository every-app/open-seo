import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionByProjectId: vi.fn(),
  getClarityReport: vi.fn(),
}));

vi.mock("@/server/features/clarity/repositories/ClarityRepository", () => ({
  ClarityRepository: {
    getConnectionByProjectId: mocks.getConnectionByProjectId,
  },
}));
vi.mock("@/server/features/clarity/services/ClarityReportService", () => ({
  getClarityReport: mocks.getClarityReport,
}));

import {
  buildClarityInsights,
  getClarityInsights,
} from "@/server/features/clarity/services/ClarityInsightsService";
import { buildClarityReportResult } from "@/server/features/clarity/services/ClarityReportSupport";

function report(
  reportKind: "overview" | "url",
  metrics: Parameters<typeof buildClarityReportResult>[0]["metrics"],
) {
  return buildClarityReportResult({
    reportKind,
    numOfDays: 3,
    metrics,
    fetchedAt: "2026-09-03T12:00:00.000Z",
    hit: true,
    stale: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Clarity insights composition", () => {
  it("returns normalized paginated data without raw provider metrics", () => {
    const overviewReport = report("overview", [
      {
        metricName: "Traffic",
        information: [{ totalSessionCount: "12" }],
      },
    ]);
    const urlReport = report("url", [
      {
        metricName: "Traffic",
        information: Array.from({ length: 12 }, (_, index) => ({
          Url: `https://example.com/page-${index}?email=private@example.com`,
          totalSessionCount: String(100 - index),
        })),
      },
    ]);

    const result = buildClarityInsights({
      page: 2,
      pageSize: 10,
      overviewReport,
      urlReport,
    });

    expect(result.overview.traffic.sessions).toBe(12);
    expect(result.pageInsights).toMatchObject({
      page: 2,
      pageSize: 10,
      totalCount: 12,
      hasNextPage: false,
    });
    expect(result.pageInsights.rows).toHaveLength(2);
    expect(result.pageInsights.rows[0]?.url).not.toContain("?");
    expect(result).not.toHaveProperty("metrics");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });

  it("fails without a nested retry when the connection changes mid-bundle", async () => {
    const originalConnection = { id: "connection_old" };
    mocks.getConnectionByProjectId
      .mockResolvedValueOnce(originalConnection)
      .mockResolvedValueOnce(originalConnection)
      .mockResolvedValueOnce({ id: "connection_new" });
    mocks.getClarityReport
      .mockResolvedValueOnce(report("overview", []))
      .mockResolvedValueOnce(report("url", []));

    await expect(
      getClarityInsights({
        projectId: "project_1",
        numOfDays: 3,
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toMatchObject({
      code: "clarity_upstream_unavailable",
      retryAfterSeconds: 2,
    });
    expect(mocks.getClarityReport).toHaveBeenCalledTimes(2);
  });
});
