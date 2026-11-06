import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasPaidPlanMock,
  workflowCreateMock,
  captureEventMock,
  latestAuditMock,
  issueGroupsMock,
  listIssuesMock,
} = vi.hoisted(() => ({
  hasPaidPlanMock: vi.fn(),
  workflowCreateMock:
    vi.fn<
      (options: { params: { config: { maxPages: number } } }) => Promise<void>
    >(),
  captureEventMock:
    vi.fn<(event: { properties: Record<string, unknown> }) => Promise<void>>(),
  latestAuditMock: vi.fn(),
  issueGroupsMock: vi.fn(),
  listIssuesMock: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { SITE_AUDIT_WORKFLOW: { create: workflowCreateMock } },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn().mockResolvedValue(true),
  getOptionalEnvValue: vi.fn(),
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: captureEventMock,
}));
vi.mock("@/server/email/onboarding-drip", () => ({
  markOnboardingMilestone: vi.fn(),
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: hasPaidPlanMock,
  getOrCreateOrganizationCustomer: vi.fn(),
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: vi.fn().mockResolvedValue({ id: "project-1" }),
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    createAudit: vi.fn(),
    getAuditUsageForOrganization: vi
      .fn()
      .mockResolvedValue({ runningCount: 1, capacityUnits: 0 }),
    getLatestAuditForProject: latestAuditMock,
  },
}));
vi.mock("@/server/features/audit/repositories/auditResultsQueries", () => ({
  getAuditIssueGroups: issueGroupsMock,
  listAuditIssues: listIssuesMock,
  listAuditPages: vi.fn(),
}));
vi.mock(
  "@/server/features/audit/repositories/CrawlerCredentialRepository",
  () => ({
    CrawlerCredentialRepository: {
      findForOrganizationAndHost: vi.fn().mockResolvedValue([]),
    },
  }),
);
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));

import {
  getAuditIssuesTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import {
  makeToolContext,
  textContent,
} from "@/server/mcp/tools/tool-test-support";

function runAudit(maxPages: number) {
  return runSiteAuditTool.handler(
    { projectId: "project-1", url: "https://example.com", maxPages },
    makeToolContext(),
  );
}

describe("run_site_audit page budget", () => {
  beforeEach(() => {
    // The start URL check resolves the host over DNS-over-HTTPS.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ Status: 0, Answer: [] }, { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a free plan's oversized audit at the plan limit and says so", async () => {
    hasPaidPlanMock.mockResolvedValue(false);

    const result = await runAudit(500);

    expect(workflowCreateMock.mock.calls[0][0].params.config.maxPages).toBe(50);
    expect(textContent(result)).toContain(
      "Free plan audits are limited to 50 pages",
    );
    expect(textContent(result)).toContain("https://open-seo.test/billing");
    expect(captureEventMock.mock.calls[0][0].properties).toMatchObject({
      max_pages: 50,
      requested_max_pages: 500,
    });
  });

  it("keeps a paid plan's page budget", async () => {
    hasPaidPlanMock.mockResolvedValue(true);

    const result = await runAudit(500);

    expect(workflowCreateMock.mock.calls[0][0].params.config.maxPages).toBe(
      500,
    );
    expect(textContent(result)).not.toContain("limited to");
  });
});

describe("get_audit_issues", () => {
  beforeEach(() => {
    latestAuditMock.mockResolvedValue({
      id: "audit-1",
      startUrl: "https://example.com",
      status: "failed",
      pagesCrawled: 0,
    });
    issueGroupsMock.mockResolvedValue([]);
    listIssuesMock.mockResolvedValue([]);
  });

  it("doesn't report an audit that failed before crawling as clean", async () => {
    const result = await getAuditIssuesTool.handler(
      { projectId: "project-1" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain("failed before crawling any pages");
    expect(textContent(result)).not.toContain("found no issues");
  });

  it("counts every matching issue and points to the next page", async () => {
    latestAuditMock.mockResolvedValue({
      id: "audit-1",
      startUrl: "https://example.com",
      status: "completed",
      pagesCrawled: 500,
    });
    issueGroupsMock.mockResolvedValue([
      { issueType: "thin-content", severity: "warning", count: 450 },
    ]);
    listIssuesMock.mockResolvedValue([
      {
        id: "issue-1",
        pageUrl: "https://example.com/a",
        issueType: "thin-content",
        severity: "warning",
        detailsJson: null,
      },
    ]);

    const result = await getAuditIssuesTool.handler(
      { projectId: "project-1", limit: 1 },
      makeToolContext(),
    );

    expect(textContent(result)).toContain("450 issues");
    expect(textContent(result)).toContain("call again with page 2");
  });
});
