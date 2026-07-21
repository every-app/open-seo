import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getLatestAuditForProject: vi.fn(),
  getAuditsByProject: vi.fn(),
  getAuditResultsForProject: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getLatestAuditForProject: mocks.getLatestAuditForProject,
    getAuditsByProject: mocks.getAuditsByProject,
    getAuditResultsForProject: mocks.getAuditResultsForProject,
  },
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

function textOf(result: { content?: Array<{ type: string; text?: string }> }) {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("competitor content MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "mudrex.com",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getLatestAuditForProject.mockResolvedValue({
      id: "audit_current",
      projectId: "project_1",
      startedAt: "2026-07-21T00:00:00.000Z",
    });
    mocks.getAuditsByProject.mockResolvedValue([
      { id: "audit_current", projectId: "project_1", startedAt: "2026-07-21T00:00:00.000Z" },
      { id: "audit_previous", projectId: "project_1", startedAt: "2026-07-14T00:00:00.000Z" },
    ]);
  });

  it("lists competitor pages with inferred page types from the latest audit", async () => {
    mocks.getAuditResultsForProject.mockResolvedValue({
      audit: { id: "audit_current" },
      pages: [
        {
          url: "https://mudrex.com/usdt-inr",
          title: "USDT to INR | Mudrex",
          metaDescription: "Convert USDT to INR",
          wordCount: 820,
          contentHash: "hash-1",
          statusCode: 200,
        },
        {
          url: "https://mudrex.com/blog/regulation-guide",
          title: "Regulation Guide",
          metaDescription: "Guide",
          wordCount: 1400,
          contentHash: "hash-2",
          statusCode: 200,
        },
      ],
      lighthouse: [],
      issues: [],
    });

    const { listCompetitorPagesTool } = await import("./competitor-content-tools");
    const result = await listCompetitorPagesTool.handler(
      { projectId: "project_1", limit: 10 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      summary: { total: 2 },
    });
    const pages = (result.structuredContent as { pages: Array<{ pageType: string }> }).pages;
    expect(pages.map((page) => page.pageType)).toEqual(
      expect.arrayContaining(["asset/fiat landing page", "guide/blog"]),
    );
    expect(textOf(result)).toContain("Competitor page inventory");
  });

  it("returns added/removed/changed competitor pages across the latest two audits", async () => {
    mocks.getAuditResultsForProject
      .mockResolvedValueOnce({
        audit: { id: "audit_current" },
        pages: [
          {
            url: "https://mudrex.com/usdt-inr",
            title: "USDT to INR | Mudrex",
            metaDescription: "Convert USDT to INR",
            wordCount: 850,
            contentHash: "hash-new",
            statusCode: 200,
          },
          {
            url: "https://mudrex.com/blog/new-guide",
            title: "New Guide",
            metaDescription: "Guide",
            wordCount: 1300,
            contentHash: "hash-add",
            statusCode: 200,
          },
        ],
        lighthouse: [],
        issues: [],
      })
      .mockResolvedValueOnce({
        audit: { id: "audit_previous" },
        pages: [
          {
            url: "https://mudrex.com/usdt-inr",
            title: "USDT to INR | Mudrex",
            metaDescription: "Convert USDT to INR",
            wordCount: 600,
            contentHash: "hash-old",
            statusCode: 200,
          },
          {
            url: "https://mudrex.com/old-page",
            title: "Old Page",
            metaDescription: "Old",
            wordCount: 300,
            contentHash: "hash-removed",
            statusCode: 200,
          },
        ],
        lighthouse: [],
        issues: [],
      });

    const { getCompetitorChangesTool } = await import("./competitor-content-tools");
    const result = await getCompetitorChangesTool.handler(
      { projectId: "project_1", limit: 20 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      summary: { total: 3, added: 1, removed: 1, materiallyChanged: 1 },
    });
    const text = textOf(result);
    expect(text).toContain("added 1");
    expect(text).toContain("removed 1");
    expect(text).toContain("changed 1");
  });
});
