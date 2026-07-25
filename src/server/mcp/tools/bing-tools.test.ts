import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  BingService: {
    getPerformance: vi.fn(),
    getConnection: vi.fn(),
  },
}));

class BingNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "BingNotConnectedError";
  }
}
class BingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}
class BingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BingTokenError";
  }
}
function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof BingTokenError) return true;
  return (
    error instanceof BingApiError &&
    (error.status === 401 || error.status === 403)
  );
}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/bing/services/BingService", () => ({
  BingService: mocks.BingService,
  BingNotConnectedError,
  isExpectedGrantFailure,
}));
vi.mock("@/server/lib/bingClient", () => ({ BingApiError, BingTokenError }));

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

describe("bing MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.BingService.getPerformance.mockReset();
    mocks.BingService.getConnection.mockReset();
  });

  it("renders rows whose columns come from the keys present on the data", async () => {
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [
        { Page: "/a", Clicks: 10, Impressions: 200 },
        { Page: "/b", Clicks: 5, Impressions: 50 },
      ],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(mocks.BingService.getPerformance).toHaveBeenCalledWith({
      projectId: "project_1",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 2,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Page | Clicks | Impressions",
    );
    expect(first.type === "text" && first.text).toContain("/a");
    expect(first.type === "text" && first.text).toContain("10");
  });

  it("derives columns from the union of keys across rows", async () => {
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: null,
      rows: [
        { Date: "2026-01-01", Clicks: 1 },
        { Date: "2026-01-02", Impressions: 3 },
      ],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Date | Clicks | Impressions",
    );
  });

  it("returns a friendly connect message for a not-connected project", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingNotConnectedError("project_1"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Bing Webmaster is not connected",
    );
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("returns a reconnect message for a revoked grant (BingTokenError)", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingTokenError("revoked"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "expired or was revoked",
    );
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("returns a reconnect message for a 401 BingApiError", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingApiError(401, "denied"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "expired or was revoked",
    );
  });

  it("returns an empty-state message instead of a table when there are no rows", async () => {
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 0,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "No Bing Webmaster performance data",
    );
    expect(first.type === "text" && first.text).not.toContain("|");
  });

  it("propagates unexpected errors rather than masking them", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new Error("database exploded"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    await expect(
      getBingPerformanceTool.handler({ projectId: "project_1" }, toolExtra),
    ).rejects.toThrow("database exploded");
  });
});
