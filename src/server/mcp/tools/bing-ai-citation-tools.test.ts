import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  BingAiCitationService: {
    getOverview: vi.fn(),
    getPagesSnapshotDetail: vi.fn(),
    getQueriesSnapshotDetail: vi.fn(),
  },
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/bing/services/BingAiCitationService", () => ({
  BingAiCitationService: mocks.BingAiCitationService,
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

describe("get_bing_ai_citations", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.BingAiCitationService.getOverview.mockReset();
    mocks.BingAiCitationService.getPagesSnapshotDetail.mockReset();
    mocks.BingAiCitationService.getQueriesSnapshotDetail.mockReset();
  });

  it("renders the daily overview newest-first", async () => {
    mocks.BingAiCitationService.getOverview.mockResolvedValue([
      { id: "d1", date: "2026-07-01", citations: 8, citedPages: 4 },
      { id: "d2", date: "2026-07-02", citations: 18, citedPages: 7 },
    ]);
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    const result = await getBingAiCitationsTool.handler(
      { projectId: "project_1", reportType: "overview", limit: 100 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      reportType: "overview",
      rowCount: 2,
    });
    const first = result.content[0];
    const text = first.type === "text" ? first.text : "";
    const lines = text.split("\n");
    const headerIndex = lines.indexOf("date | citations | cited pages");
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    // Newest-first: the 07-02 row comes before the 07-01 row.
    expect(lines[headerIndex + 1]).toContain("2026-07-02");
    expect(lines[headerIndex + 2]).toContain("2026-07-01");
  });

  it("reports no overview data as an empty result, not an error", async () => {
    mocks.BingAiCitationService.getOverview.mockResolvedValue([]);
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    const result = await getBingAiCitationsTool.handler(
      { projectId: "project_1", reportType: "overview", limit: 100 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 0 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("Upload the Overview export");
  });

  it("renders the latest pages snapshot with its period", async () => {
    mocks.BingAiCitationService.getPagesSnapshotDetail.mockResolvedValue({
      snapshots: [
        {
          id: "s1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          rowCount: 2,
        },
      ],
      snapshot: {
        id: "s1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        rowCount: 2,
      },
      rows: [
        { page: "https://example.com/", citations: 352 },
        { page: "https://example.com/glossary", citations: 295 },
      ],
    });
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    const result = await getBingAiCitationsTool.handler(
      { projectId: "project_1", reportType: "pages", limit: 100 },
      toolExtra,
    );

    expect(mocks.BingAiCitationService.getPagesSnapshotDetail).toHaveBeenCalledWith(
      "project_1",
      null,
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      reportType: "pages",
      rowCount: 2,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      snapshotCount: 1,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("page | citations");
    expect(first.type === "text" && first.text).toContain(
      "https://example.com/glossary",
    );
  });

  it("passes a requested snapshotId through", async () => {
    mocks.BingAiCitationService.getQueriesSnapshotDetail.mockResolvedValue({
      snapshots: [],
      snapshot: null,
      rows: [],
    });
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    await getBingAiCitationsTool.handler(
      {
        projectId: "project_1",
        reportType: "queries",
        snapshotId: "older_snapshot",
        limit: 100,
      },
      toolExtra,
    );

    expect(
      mocks.BingAiCitationService.getQueriesSnapshotDetail,
    ).toHaveBeenCalledWith("project_1", "older_snapshot");
  });

  it("reports no queries uploaded yet as an empty result", async () => {
    mocks.BingAiCitationService.getQueriesSnapshotDetail.mockResolvedValue({
      snapshots: [],
      snapshot: null,
      rows: [],
    });
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    const result = await getBingAiCitationsTool.handler(
      { projectId: "project_1", reportType: "queries", limit: 100 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      reportType: "queries",
      rowCount: 0,
      snapshotCount: 0,
    });
  });

  it("applies the limit against the chosen snapshot's rows", async () => {
    mocks.BingAiCitationService.getPagesSnapshotDetail.mockResolvedValue({
      snapshots: [
        {
          id: "s1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          rowCount: 2,
        },
      ],
      snapshot: {
        id: "s1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        rowCount: 2,
      },
      rows: [
        { page: "https://example.com/", citations: 352 },
        { page: "https://example.com/glossary", citations: 295 },
      ],
    });
    const { getBingAiCitationsTool } = await import("./bing-ai-citation-tools");

    const result = await getBingAiCitationsTool.handler(
      { projectId: "project_1", reportType: "pages", limit: 1 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 1 });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("top 1 of 2");
  });
});
