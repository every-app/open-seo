import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  hasSelfHostedGscConfig: vi.fn(),
  GscService: {
    getPerformance: vi.fn(),
    inspectUrls: vi.fn(),
  },
}));

class GscNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "GscNotConnectedError";
  }
}
class GscApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GscApiError";
  }
}
class GscTokenError extends Error {}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/gsc/oauth-config", () => ({
  hasSelfHostedGscConfig: mocks.hasSelfHostedGscConfig,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: mocks.GscService,
  GscNotConnectedError,
}));
vi.mock("@/server/lib/gscClient", () => ({ GscApiError, GscTokenError }));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

describe("search console MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.isHostedServerAuthMode.mockReset();
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.hasSelfHostedGscConfig.mockReset();
    mocks.hasSelfHostedGscConfig.mockResolvedValue(false);
    mocks.GscService.getPerformance.mockReset();
    mocks.GscService.inspectUrls.mockReset();
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
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

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
      toolExtra,
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
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
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
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
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
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1", dimensions: ["query", "searchAppearance"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("rejects a half-specified explicit date range", async () => {
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1", startDate: "2026-01-01" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("returns a setup message in self-hosted mode without a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGscConfig.mockResolvedValue(false);
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "gsc_oauth_not_configured",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("allows performance queries in self-hosted mode with a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGscConfig.mockResolvedValue(true);
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
    const { getSearchConsolePerformanceTool } =
      await import("./search-console-tools");

    const result = await getSearchConsolePerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
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
    const { inspectUrlsTool } = await import("./search-console-tools");

    const result = await inspectUrlsTool.handler(
      {
        projectId: "project_1",
        urls: ["https://example.com/a", "https://example.com/bad"],
      },
      toolExtra,
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
    const { inspectUrlsTool } = await import("./search-console-tools");

    const result = await inspectUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("returns a setup message for inspect_urls in self-hosted mode without a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGscConfig.mockResolvedValue(false);
    const { inspectUrlsTool } = await import("./search-console-tools");

    const result = await inspectUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "gsc_oauth_not_configured",
    });
    expect(mocks.GscService.inspectUrls).not.toHaveBeenCalled();
  });
});
