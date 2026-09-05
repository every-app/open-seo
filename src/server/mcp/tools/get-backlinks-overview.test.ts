import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getBacklinksOverviewTool } from "./get-backlinks-overview";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  profileOverview: vi.fn(),
  profileReferringDomainsPage: vi.fn(),
  getBingSiteData: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: {
    profileOverview: mocks.profileOverview,
    profileReferringDomainsPage: mocks.profileReferringDomainsPage,
  },
}));

vi.mock("@/server/lib/keyword-providers/bing-site", () => ({
  getBingSiteData: mocks.getBingSiteData,
}));

const toolContext = makeToolContext();

describe("get_backlinks_overview Bing fallback", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("degrades to Bing Webmaster link data when DataForSEO is unconfigured", async () => {
    mocks.profileOverview.mockRejectedValue(
      new AppError("DATAFORSEO_AUTH_FAILED", "credentials missing"),
    );
    mocks.getBingSiteData.mockResolvedValue({
      siteUrl: "example.com",
      registered: true,
      links: {
        sourcedDomains: 12,
        backlinks: 340,
        topSources: [{ source: "partner.example", backlinks: 180 }],
      },
      queries: [],
      notes: ["Data source: Bing Webmaster (free)."],
    });

    const result = await getBacklinksOverviewTool.handler(
      { projectId: "project_1", target: "example.com" },
      toolContext,
    );

    const structured = z
      .object({
        overview: z
          .object({
            summary: z.object({ backlinks: z.number().nullable() }).passthrough(),
          })
          .passthrough(),
      })
      .passthrough()
      .parse(result.structuredContent);
    expect(structured.overview.summary.backlinks).toBe(340);
    expect(structured.overview.source).toBe("bing_webmaster");

    const out = textContent(result);
    expect(out).toContain("Bing Webmaster");
    expect(out).toContain("referring domains (sourced): 12");
    expect(out).toContain("partner.example");
  });

  it("rethrows the config error when Bing is unavailable too", async () => {
    mocks.profileOverview.mockRejectedValue(
      new AppError("DATAFORSEO_AUTH_FAILED", "credentials missing"),
    );
    mocks.getBingSiteData.mockResolvedValue(null);

    await expect(
      getBacklinksOverviewTool.handler(
        { projectId: "project_1", target: "example.com" },
        toolContext,
      ),
    ).rejects.toThrow("credentials missing");
  });
});
