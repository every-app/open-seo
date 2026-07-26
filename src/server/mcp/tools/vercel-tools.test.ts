import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getTraffic: vi.fn(),
  getEventTrend: vi.fn(),
}));

class VercelNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "VercelNotConnectedError";
  }
}
class VercelApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}
function isExpectedVercelFailure(error: unknown): boolean {
  return (
    error instanceof VercelApiError &&
    (error.status === 401 || error.status === 403)
  );
}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/vercel/services/VercelAnalyticsService", () => ({
  VercelAnalyticsService: {
    getTraffic: mocks.getTraffic,
    getEventTrend: mocks.getEventTrend,
  },
  VercelNotConnectedError,
}));
vi.mock("@/server/lib/vercelAnalytics", () => ({
  isExpectedVercelFailure,
  VercelApiError,
}));

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

const report = {
  vercelProjectName: "scholar-sidekick",
  range: { since: "2026-06-27", until: "2026-07-27" },
  prevRange: { since: "2026-05-28", until: "2026-06-27" },
  totals: { visitors: 2101, pageviews: 3892 },
  prevTotals: { visitors: 1400, pageviews: 2500 },
  daily: [{ key: "2026-07-12T00:00:00.000Z", visitors: 50, pageviews: 71 }],
  referrers: [
    { key: "", visitors: 1101, pageviews: 1892 },
    { key: "google.com", visitors: 452, pageviews: 519 },
    { key: "claude.ai", visitors: 43, pageviews: 45 },
  ],
  pages: [{ key: "/tools/doi-lookup", visitors: 130, pageviews: 148 }],
  events: [
    { key: "audit_completed", visitors: 5, count: 11 },
    { key: "checkout_completed", visitors: 1, count: 1 },
  ],
  prevEvents: [{ key: "audit_completed", visitors: 3, count: 6 }],
};

describe("get_vercel_traffic", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getTraffic.mockReset();
    mocks.getTraffic.mockResolvedValue(report);
  });

  it("renders referrers by default with totals and the direct label", async () => {
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "referrer", limit: 25 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      vercelProjectName: "scholar-sidekick",
      totals: { visitors: 2101, pageviews: 3892 },
      rowCount: 3,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "referrer | visitors | pageviews",
    );
    expect(first.type === "text" && first.text).toContain("(direct)");
    expect(first.type === "text" && first.text).toContain("claude.ai");
    expect(first.type === "text" && first.text).toContain("prev 30d: 1400");
  });

  it("serves pages and day dimensions", async () => {
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const pages = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "page", limit: 25 },
      toolExtra,
    );
    const pagesText = pages.content[0];
    expect(pagesText.type === "text" && pagesText.text).toContain(
      "/tools/doi-lookup",
    );

    const days = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "day", limit: 25 },
      toolExtra,
    );
    const daysText = days.content[0];
    expect(daysText.type === "text" && daysText.text).toContain("2026-07-12");
  });

  it("applies the limit", async () => {
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "referrer", limit: 1 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
  });

  it("returns the connect message for a not-connected project", async () => {
    mocks.getTraffic.mockRejectedValue(new VercelNotConnectedError("p1"));
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "referrer", limit: 25 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("reports a rejected token as api_error", async () => {
    mocks.getTraffic.mockRejectedValue(new VercelApiError(401, "denied"));
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "referrer", limit: 25 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
  });

  it("lists custom events for the event dimension", async () => {
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      { projectId: "project_1", dimension: "event", limit: 25 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 2 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "event | visitors | events",
    );
    expect(first.type === "text" && first.text).toContain("audit_completed");
    expect(first.type === "text" && first.text).toContain("checkout_completed");
  });

  it("drills into one event's daily trend when eventName is set", async () => {
    mocks.getEventTrend.mockResolvedValue({
      vercelProjectName: "scholar-sidekick",
      range: { since: "2026-06-27", until: "2026-07-27" },
      eventName: "audit_completed",
      daily: [
        { key: "2026-07-22T00:00:00.000Z", visitors: 1, count: 5 },
        { key: "2026-07-25T00:00:00.000Z", visitors: 1, count: 3 },
      ],
    });
    const { getVercelTrafficTool } = await import("./vercel-tools");

    const result = await getVercelTrafficTool.handler(
      {
        projectId: "project_1",
        dimension: "referrer",
        eventName: "audit_completed",
        limit: 25,
      },
      toolExtra,
    );

    expect(mocks.getEventTrend).toHaveBeenCalledWith({
      projectId: "project_1",
      eventName: "audit_completed",
    });
    expect(mocks.getTraffic).not.toHaveBeenCalled();
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("'audit_completed'");
    expect(first.type === "text" && first.text).toContain("8 events");
    expect(first.type === "text" && first.text).toContain("2026-07-22");
  });

  it("propagates unexpected errors rather than masking them", async () => {
    mocks.getTraffic.mockRejectedValue(new Error("database exploded"));
    const { getVercelTrafficTool } = await import("./vercel-tools");

    await expect(
      getVercelTrafficTool.handler(
        { projectId: "project_1", dimension: "referrer", limit: 25 },
        toolExtra,
      ),
    ).rejects.toThrow("database exploded");
  });
});
