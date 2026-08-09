import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  hasSelfHostedGa4Config: vi.fn(),
  Ga4Service: {
    getPerformance: vi.fn(),
  },
}));

class Ga4NotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "Ga4NotConnectedError";
  }
}
class Ga4ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "Ga4ApiError";
  }
}
class Ga4TokenError extends Error {}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/ga4/oauth-config", () => ({
  hasSelfHostedGa4Config: mocks.hasSelfHostedGa4Config,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/ga4/services/Ga4Service", () => ({
  Ga4Service: mocks.Ga4Service,
  Ga4NotConnectedError,
}));
vi.mock("@/server/lib/ga4Client", () => ({ Ga4ApiError, Ga4TokenError }));

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

describe("analytics MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.isHostedServerAuthMode.mockReset();
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.hasSelfHostedGa4Config.mockReset();
    mocks.hasSelfHostedGa4Config.mockResolvedValue(false);
    mocks.Ga4Service.getPerformance.mockReset();
  });

  it("returns flattened rows on success", async () => {
    mocks.Ga4Service.getPerformance.mockResolvedValue({
      propertyId: "properties/123",
      propertyDisplayName: "example.com",
      connectedBy: "alice@example.com",
      request: {
        dateRanges: [{ startDate: "2026-04-29", endDate: "2026-05-27" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        limit: 1000,
      },
      report: {
        rows: [
          {
            dimensionValues: [{ value: "Organic Search" }],
            metricValues: [{ value: "42" }],
          },
        ],
      },
    });
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      {
        projectId: "project_1",
        dimensions: ["sessionDefaultChannelGroup"],
        metrics: ["sessions"],
      },
      toolExtra,
    );

    expect(mocks.Ga4Service.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        dimensions: ["sessionDefaultChannelGroup"],
        metrics: ["sessions"],
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      propertyId: "properties/123",
      rowCount: 1,
      rows: [{ sessionDefaultChannelGroup: "Organic Search", sessions: "42" }],
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "sessionDefaultChannelGroup | sessions",
    );
    expect(text?.type === "text" && text.text).toContain("Organic Search");
  });

  it("surfaces a not-connected message with a connect URL", async () => {
    mocks.Ga4Service.getPerformance.mockRejectedValue(
      new Ga4NotConnectedError("project_1"),
    );
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      { projectId: "project_1", metrics: ["sessions"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const first = result.content[0];
    expect(first.type).toBe("text");
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("renders an api_error with a reconnect URL on a GA4 API failure", async () => {
    mocks.Ga4Service.getPerformance.mockRejectedValue(
      new Ga4ApiError(403, "no access"),
    );
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      { projectId: "project_1", metrics: ["sessions"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("rejects a half-specified explicit date range", async () => {
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      {
        projectId: "project_1",
        metrics: ["sessions"],
        startDate: "2026-01-01",
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.Ga4Service.getPerformance).not.toHaveBeenCalled();
  });

  it("returns a setup message in self-hosted mode without a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGa4Config.mockResolvedValue(false);
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      { projectId: "project_1", metrics: ["sessions"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "ga4_oauth_not_configured",
    });
    expect(mocks.Ga4Service.getPerformance).not.toHaveBeenCalled();
  });

  it("allows performance queries in self-hosted mode with a Google client", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGa4Config.mockResolvedValue(true);
    mocks.Ga4Service.getPerformance.mockResolvedValue({
      propertyId: "properties/123",
      propertyDisplayName: null,
      connectedBy: "alice@example.com",
      request: {
        dateRanges: [{ startDate: "2026-04-29", endDate: "2026-05-27" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
        limit: 1000,
      },
      report: { rows: [] },
    });
    const { getAnalyticsPerformanceTool } = await import(
      "./analytics-tools"
    );

    const result = await getAnalyticsPerformanceTool.handler(
      { projectId: "project_1", metrics: ["sessions"] },
      toolExtra,
    );

    expect(mocks.Ga4Service.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1" }),
    );
    expect(result.structuredContent).toMatchObject({ ok: true });
  });
});
