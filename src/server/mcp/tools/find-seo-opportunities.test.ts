import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  hasSelfHostedGscConfig: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  getPerformance: vi.fn(),
  getLatestAuditForProject: vi.fn(),
  getIssuesForAudit: vi.fn(),
  getPagesForAudit: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForOrganization: mocks.getProjectForOrganization },
}));
vi.mock("@/server/features/gsc/oauth-config", () => ({
  hasSelfHostedGscConfig: mocks.hasSelfHostedGscConfig,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscNotConnectedError: class GscNotConnectedError extends Error {},
  GscService: { getPerformance: mocks.getPerformance },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getLatestAuditForProject: mocks.getLatestAuditForProject,
    getIssuesForAudit: mocks.getIssuesForAudit,
    getPagesForAudit: mocks.getPagesForAudit,
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

describe("find_seo_opportunities MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "ledgerpe.com",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.hasSelfHostedGscConfig.mockResolvedValue(true);
    mocks.getLatestAuditForProject.mockResolvedValue({ id: "audit_1" });
    mocks.getIssuesForAudit.mockResolvedValue([
      {
        severity: "critical",
        issueType: "missing_title",
        pageUrl: "https://ledgerpe.com/settle",
        detailsJson: null,
      },
    ]);
    mocks.getPagesForAudit.mockResolvedValue([
      {
        url: "https://ledgerpe.com/settle",
        title: null,
        metaDescription: null,
        wordCount: 120,
        internalLinkCount: 1,
        crawlDepth: 4,
        statusCode: 200,
        fetchClass: "ok",
        isIndexable: true,
        inSitemap: true,
        responseTimeMs: 100,
      },
    ]);
  });

  it("combines GSC and audit evidence into opportunity rows", async () => {
    mocks.getPerformance
      .mockResolvedValueOnce({
        rows: [
          {
            keys: ["ledger settlement", "https://ledgerpe.com/settle"],
            clicks: 20,
            impressions: 500,
            ctr: 0.04,
            position: 8.2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            keys: ["https://ledgerpe.com/home"],
            clicks: 10,
            impressions: 600,
            ctr: 0.02,
            position: 3.1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            keys: ["https://ledgerpe.com/home"],
            clicks: 18,
            impressions: 900,
            ctr: 0.02,
            position: 3,
          },
        ],
      });

    const { findSeoOpportunitiesTool } = await import("./find-seo-opportunities");
    const result = await findSeoOpportunitiesTool.handler(
      { projectId: "project_1", limit: 10 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      providers: {
        google_search_console: { ok: true },
        site_audit: { ok: true, auditId: "audit_1" },
      },
    });
    const opportunities = (result.structuredContent as { opportunities: Array<{ type: string }> }).opportunities;
    expect(opportunities.map((row) => row.type)).toEqual(
      expect.arrayContaining([
        "striking_distance",
        "low_ctr",
        "declining_page",
        "technical_issue",
      ]),
    );
    expect(textOf(result)).toContain("Found");
    expect(textOf(result)).toContain("[striking_distance]");
  });

  it("degrades gracefully when GSC is unavailable and no audit exists", async () => {
    mocks.hasSelfHostedGscConfig.mockResolvedValue(false);
    mocks.getLatestAuditForProject.mockResolvedValue(null);

    const { findSeoOpportunitiesTool } = await import("./find-seo-opportunities");
    const result = await findSeoOpportunitiesTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      summary: { total: 0 },
      providers: {
        google_search_console: { ok: false },
        site_audit: { ok: false },
      },
    });
    const text = textOf(result);
    expect(text).toContain("No evidence-backed SEO opportunities");
    expect(text).toContain("GSC unavailable");
    expect(text).toContain("Site audit unavailable");
  });
});
