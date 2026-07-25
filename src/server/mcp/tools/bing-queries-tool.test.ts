import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  BingService: {
    getPerformance: vi.fn(),
    getQueryReport: vi.fn(),
    getPageQueries: vi.fn(),
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

describe("get_bing_queries", () => {
  const report = {
    siteUrl: "https://example.com/",
    connectedBy: "alice@example.com",
    queries: [
      { key: "top query", clicks: 50, impressions: 500, ctr: 0.1, position: 2 },
      {
        key: "striking query",
        clicks: 6,
        impressions: 400,
        ctr: 0.015,
        position: 8.5,
      },
      { key: "unranked", clicks: 0, impressions: 20, ctr: 0, position: null },
    ],
    pages: [
      {
        key: "https://example.com/pricing",
        clicks: 10,
        impressions: 200,
        ctr: 0.05,
        position: 6,
      },
    ],
    striking: [
      {
        key: "striking query",
        clicks: 6,
        impressions: 400,
        ctr: 0.015,
        position: 8.5,
      },
    ],
  };

  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.BingService.getQueryReport.mockReset();
    mocks.BingService.getQueryReport.mockResolvedValue(report);
  });

  it("renders aggregated query rows with ctr and position, null position as -", async () => {
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 3,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "query | clicks | impressions | ctr | position",
    );
    expect(first.type === "text" && first.text).toContain("10.0%");
    expect(first.type === "text" && first.text).toContain("8.5");
    expect(first.type === "text" && first.text).toMatch(/unranked.*-/);
  });

  it("serves pages under a page header for the page dimension", async () => {
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "page",
        strikingDistanceOnly: false,
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "page | clicks | impressions",
    );
    expect(first.type === "text" && first.text).toContain(
      "https://example.com/pricing",
    );
  });

  it("filters to striking-distance queries when asked", async () => {
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: true,
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("striking query");
    expect(first.type === "text" && first.text).not.toContain("top query");
  });

  it("applies the limit against the chosen row set", async () => {
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        limit: 1,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("top 1 of 3");
  });

  it("drills down to one page's queries when pageUrl is set", async () => {
    mocks.BingService.getPageQueries.mockResolvedValue({
      siteUrl: "https://example.com/",
      pageUrl: "https://example.com/pricing",
      queries: [
        {
          key: "pricing query",
          clicks: 4,
          impressions: 50,
          ctr: 0.08,
          position: 6,
        },
      ],
    });
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        pageUrl: "https://example.com/pricing",
        limit: 100,
      },
      toolExtra,
    );

    expect(mocks.BingService.getPageQueries).toHaveBeenCalledWith({
      projectId: "project_1",
      pageUrl: "https://example.com/pricing",
    });
    expect(mocks.BingService.getQueryReport).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "queries for https://example.com/pricing",
    );
    expect(first.type === "text" && first.text).toContain("pricing query");
  });

  it("reports an unsampled page as an empty result, not an error", async () => {
    mocks.BingService.getPageQueries.mockResolvedValue({
      siteUrl: "https://example.com/",
      pageUrl: "https://example.com/new-page",
      queries: [],
    });
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        pageUrl: "https://example.com/new-page",
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 0 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("this page");
  });

  it("returns the connect message for a not-connected project", async () => {
    mocks.BingService.getQueryReport.mockRejectedValue(
      new BingNotConnectedError("project_1"),
    );
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("returns the reconnect message for a dead grant", async () => {
    mocks.BingService.getQueryReport.mockRejectedValue(
      new BingApiError(401, "denied"),
    );
    const { getBingQueriesTool } = await import("./bing-tools");

    const result = await getBingQueriesTool.handler(
      {
        projectId: "project_1",
        dimension: "query",
        strikingDistanceOnly: false,
        limit: 100,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
  });
});
