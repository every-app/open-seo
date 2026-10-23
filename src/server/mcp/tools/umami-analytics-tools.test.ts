import { beforeEach, describe, expect, it, vi } from "vitest";
import { UmamiError } from "@/server/lib/umamiErrors";
import {
  getUmamiLandingPagesTool,
  getUmamiTrafficSourcesTool,
} from "./umami-analytics-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  runReport: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/umami/services/UmamiReportingService", () => ({
  UmamiReportingService: { runReport: mocks.runReport },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();
const page = { projectId: "project_1", limit: 100, offset: 0 };

describe("Umami MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.runReport.mockResolvedValue({
      status: "ok",
      source: { provider: "umami", websiteName: "Site" },
      request: {
        reportKind: "channels",
        resolvedDateRange: { startDate: "2026-10-01", endDate: "2026-10-28" },
        channel: "all",
        dimensions: ["channel"],
        metrics: ["visits"],
      },
      rowCount: 1,
      rows: [{ channel: "organicSearch", visits: 9 }],
      pageInfo: { limit: 100, offset: 0, hasMore: false },
      warnings: [],
    });
  });

  it("maps the channel breakdown to the unfiltered channel report", async () => {
    const result = await getUmamiTrafficSourcesTool.handler(
      { ...page, breakdown: "channel", channel: "organic_search" },
      toolContext,
    );

    expect(mocks.runReport).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "channels" }),
    );
    expect(textContent(result)).toContain("organicSearch");
  });

  it("points connection problems at the project's integration settings", async () => {
    mocks.runReport.mockRejectedValue(
      new UmamiError(
        "umami_auth_failed",
        "Umami rejected the saved credentials.",
      ),
    );

    const result = await getUmamiLandingPagesTool.handler(
      { ...page, channel: "organic_search" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: {
        code: "umami_auth_failed",
        actionUrl: "https://open-seo.test/p/project_1/settings/integrations",
      },
    });
  });
});
