import { beforeEach, describe, expect, it, vi } from "vitest";
import { GscApiError, GscNotConnectedError } from "@/server/lib/gscErrors";
import * as searchConsoleTools from "./search-console-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  hasSelfHostedGoogleOAuthConfig: vi.fn(),
  GscService: {
    getPerformance: vi.fn(),
    inspectUrls: vi.fn(),
  },
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/google/oauth-config", () => ({
  hasSelfHostedGoogleOAuthConfig: mocks.hasSelfHostedGoogleOAuthConfig,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: mocks.GscService,
}));
const toolContext = makeToolContext();

describe("search console MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(false);
  });

  it("returns performance rows on success and passes filters through", async () => {
    mocks.GscService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      request: {
        dimensions: ["query"],
        startDate: "2026-04-27",
        endDate: "2026-05-25",
        rowLimit: 1000,
      },
      rows: [
        {
          keys: ["seo tools"],
          clicks: 12,
          impressions: 300,
          ctr: 0.04,
          position: 7.5,
        },
      ],
    });
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      {
        projectId: "project_1",
        dimensions: ["query"],
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/x",
          },
        ],
      },
      toolContext,
    );

    expect(mocks.GscService.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/x",
          },
        ],
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 1,
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "key | clicks | impressions | CTR | position",
    );
    expect(text?.type === "text" && text.text).toContain("seo tools");
    expect(text?.type === "text" && text.text).toContain("4.0%");
  });

  it("surfaces a not-connected message with a connect URL", async () => {
    mocks.GscService.getPerformance.mockRejectedValue(
      new GscNotConnectedError("project_1"),
    );
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const first = result.content[0];
    expect(first.type).toBe("text");
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/search-performance",
    );
  });

  it("renders an api_error with a reconnect URL on a GSC API failure", async () => {
    mocks.GscService.getPerformance.mockRejectedValue(
      new GscApiError(403, "no access"),
    );
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/search-performance",
    );
  });

  it("rejects searchAppearance combined with another dimension", async () => {
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1", dimensions: ["query", "searchAppearance"] },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("rejects a half-specified explicit date range", async () => {
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1", startDate: "2026-01-01" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("returns a setup message in self-hosted mode without a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(false);
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "gsc_oauth_not_configured",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("allows performance queries in self-hosted mode with a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(true);
    mocks.GscService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      request: {
        dimensions: ["query"],
        startDate: "2026-04-27",
        endDate: "2026-05-25",
        rowLimit: 1000,
      },
      rows: [],
    });
    const { getSearchConsolePerformanceTool } = searchConsoleTools;

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.GscService.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1" }),
    );
    expect(result.structuredContent).toMatchObject({ ok: true });
  });

  it("inspects multiple URLs and reports partial failures inline", async () => {
    mocks.GscService.inspectUrls.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedBy: "alice@example.com",
      results: [
        {
          url: "https://example.com/a",
          result: {
            indexStatusResult: { verdict: "PASS", coverageState: "Indexed" },
          },
        },
        {
          url: "https://example.com/bad",
          result: null,
          error: "Search Console API error (400)",
        },
      ],
    });
    const { inspectUrlsTool } = searchConsoleTools;

    const result = await inspectUrlsTool.handler(
      {
        projectId: "project_1",
        urls: ["https://example.com/a", "https://example.com/bad"],
      },
      toolContext,
    );

    expect(mocks.GscService.inspectUrls).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        urls: ["https://example.com/a", "https://example.com/bad"],
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "sc-domain:example.com",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("PASS");
    expect(first.type === "text" && first.text).toContain("error:");
  });

  it("surfaces a not-connected message from inspect_urls", async () => {
    mocks.GscService.inspectUrls.mockRejectedValue(
      new GscNotConnectedError("project_1"),
    );
    const { inspectUrlsTool } = searchConsoleTools;

    const result = await inspectUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("returns a setup message for inspect_urls in self-hosted mode without a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(false);
    const { inspectUrlsTool } = searchConsoleTools;

    const result = await inspectUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "gsc_oauth_not_configured",
    });
    expect(mocks.GscService.inspectUrls).not.toHaveBeenCalled();
  });
});
