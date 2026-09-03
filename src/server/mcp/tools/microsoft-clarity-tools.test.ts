import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClarityReportError } from "@/server/lib/clarityErrors";
import {
  getMicrosoftClarityOverviewTool,
  getMicrosoftClarityUrlInsightsTool,
} from "@/server/mcp/tools/microsoft-clarity-tools";
import {
  makeToolContext,
  textContent,
} from "@/server/mcp/tools/tool-test-support";

const mocks = vi.hoisted(() => ({
  getReport: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/features/clarity/services/ClarityService", () => ({
  ClarityService: { getReport: mocks.getReport },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

function normalizedPage(index: number) {
  return {
    url: `https://example.com/page-${index + 1}`,
    privacyVariant: null,
    traffic: {
      sessions: index + 1,
      botSessions: 0,
      distinctUsers: index + 1,
      pagesPerSession: 1,
    },
    engagement: {
      averageActiveTimeSeconds: 10,
      averageTotalTimeSeconds: 20,
      activeTimePercent: 50,
    },
    scrollDepthPercent: 40,
    friction: {
      deadClicks: {
        count: 0,
        pageViews: 0,
        sessions: index + 1,
        sessionsWithMetricPercent: 0,
        sessionsWithoutMetricPercent: 100,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
});

describe("Microsoft Clarity MCP tools", () => {
  it("bounds URL rows per metric and keeps a readable text preview", async () => {
    mocks.getReport.mockResolvedValue({
      status: "ok",
      source: {
        provider: "microsoft_clarity",
        api: "data_export",
        timeZone: "UTC",
      },
      request: { reportKind: "url", numOfDays: 3, dimensions: ["URL"] },
      metrics: [
        {
          metricName: "Traffic",
          information: Array.from({ length: 12 }, (_, index) => ({
            Url: `https://example.com/page-${index + 1}`,
            openSeoUrlJoinKey: `url-${index + 1}`,
            totalSessionCount: String(index + 1),
          })),
        },
      ],
      normalized: {
        schemaVersion: 1,
        kind: "url",
        pages: Array.from({ length: 12 }, (_, index) => normalizedPage(index)),
      },
      coverage: {
        rawMetricGroups: 1,
        rawInformationRows: 12,
        providerRowLimit: 1_000,
        providerResponseRowLimitReached: false,
        providerLimitedMetricNames: [],
        missingExpectedMetricNames: [],
        unknownMetricNames: [],
        duplicateMetricNames: [],
      },
      cache: {
        hit: true,
        stale: false,
        fetchedAt: "2026-09-03T00:00:00.000Z",
        ttlHours: 24,
      },
      warnings: [],
    });

    const result = await getMicrosoftClarityUrlInsightsTool.handler(
      { projectId: "project_1", numOfDays: 3, limitPerMetric: 10 },
      toolContext,
    );
    const structured =
      getMicrosoftClarityUrlInsightsTool.config.outputSchema.parse(
        result.structuredContent,
      );

    expect(mocks.getReport).toHaveBeenCalledWith({
      projectId: "project_1",
      reportKind: "url",
      numOfDays: 3,
    });
    expect(structured.metrics?.[0]?.information).toHaveLength(10);
    expect(structured.normalized?.kind).toBe("url");
    if (structured.normalized?.kind === "url") {
      expect(structured.normalized.pages).toHaveLength(10);
    }
    expect(structured.truncation).toMatchObject({
      totalRows: 12,
      returnedRows: 10,
      truncatedMetrics: 1,
      normalizedRowsTruncated: true,
    });
    expect(structured.warnings).toContain("information_rows_truncated");
    expect(JSON.stringify(structured)).not.toContain("openSeoUrlJoinKey");
    expect(textContent(result)).toContain("https://example.com/page-1");
    expect(
      getMicrosoftClarityUrlInsightsTool.config.outputSchema.safeParse(
        structured,
      ).success,
    ).toBe(true);
  });

  it("applies global row and string bounds to structured output", async () => {
    const longUrl = `https://example.com/${"x".repeat(500)}?secret=value`;
    mocks.getReport.mockResolvedValue({
      status: "ok",
      source: {
        provider: "microsoft_clarity",
        api: "data_export",
        timeZone: "UTC",
      },
      request: { reportKind: "url", numOfDays: 3, dimensions: ["URL"] },
      metrics: ["Traffic", "EngagementTime", "ScrollDepth"].map(
        (metricName) => ({
          metricName,
          information: Array.from({ length: 50 }, (_, index) => ({
            Url: `${longUrl}-${index}`,
            value: "v".repeat(500),
          })),
        }),
      ),
      normalized: {
        schemaVersion: 1,
        kind: "url",
        pages: Array.from({ length: 80 }, (_, index) => ({
          ...normalizedPage(index),
          url: `${longUrl}-${index}`,
        })),
      },
      coverage: {
        rawMetricGroups: 3,
        rawInformationRows: 150,
        providerRowLimit: 1_000,
        providerResponseRowLimitReached: false,
        providerLimitedMetricNames: [],
        missingExpectedMetricNames: [],
        unknownMetricNames: [],
        duplicateMetricNames: [],
      },
      cache: {
        hit: true,
        stale: false,
        fetchedAt: "2026-09-03T00:00:00.000Z",
        ttlHours: 24,
      },
      warnings: [],
    });

    const result = await getMicrosoftClarityUrlInsightsTool.handler(
      { projectId: "project_1", numOfDays: 3, limitPerMetric: 50 },
      toolContext,
    );
    const structured =
      getMicrosoftClarityUrlInsightsTool.config.outputSchema.parse(
        result.structuredContent,
      );
    const rawRows =
      structured.metrics?.reduce(
        (total, metric) => total + metric.information.length,
        0,
      ) ?? 0;

    expect(rawRows).toBe(50);
    expect(structured.truncation).toMatchObject({
      maxTotalRawRows: 50,
      maxTotalNormalizedRows: 50,
      maxStringLength: 256,
      returnedRows: 50,
      returnedNormalizedRows: 50,
    });
    expect(structured.metrics?.[0]?.information[0]?.value).toHaveLength(256);
    if (structured.normalized?.kind === "url") {
      expect(structured.normalized.pages).toHaveLength(50);
      expect(structured.normalized.pages[0]?.url.length).toBeLessThanOrEqual(
        256,
      );
      expect(structured.normalized.pages[0]?.url).not.toContain("?");
    }
  });

  it("returns a reconnect action without leaking credential material", async () => {
    mocks.getReport.mockRejectedValue(
      new ClarityReportError(
        "clarity_reconnect_required",
        "The Microsoft Clarity token is invalid, expired, or no longer authorized.",
      ),
    );

    const result = await getMicrosoftClarityOverviewTool.handler(
      { projectId: "project_1", numOfDays: 3, limitPerMetric: 10 },
      toolContext,
    );
    const structured =
      getMicrosoftClarityOverviewTool.config.outputSchema.parse(
        result.structuredContent,
      );

    expect(structured.error).toMatchObject({
      code: "clarity_reconnect_required",
      actionUrl:
        "https://open-seo.test/p/project_1/settings/integrations#microsoft-clarity",
    });
    expect(textContent(result)).not.toContain("Bearer");
    expect(
      getMicrosoftClarityOverviewTool.config.outputSchema.safeParse(structured)
        .success,
    ).toBe(true);
  });

  it("keeps project authorization ahead of the provider call", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      getMicrosoftClarityOverviewTool.handler(
        { projectId: "foreign_project", numOfDays: 3, limitPerMetric: 10 },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
});
