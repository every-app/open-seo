import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasPaidPlanMock,
  workflowCreateMock,
  captureEventMock,
  latestAuditMock,
  auditMock,
  pageCountsMock,
  canRenderMock,
  issueGroupsMock,
  listIssuesMock,
  lighthouseResultsMock,
} = vi.hoisted(() => ({
  hasPaidPlanMock: vi.fn(),
  workflowCreateMock:
    vi.fn<
      (options: { params: { config: { maxPages: number } } }) => Promise<void>
    >(),
  captureEventMock:
    vi.fn<(event: { properties: Record<string, unknown> }) => Promise<void>>(),
  latestAuditMock: vi.fn(),
  auditMock: vi.fn(),
  pageCountsMock: vi.fn(),
  canRenderMock: vi.fn(),
  issueGroupsMock: vi.fn(),
  listIssuesMock: vi.fn(),
  lighthouseResultsMock: vi.fn(),
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
    getAuditForProject: auditMock,
    countPagesByFetchClass: pageCountsMock,
  },
}));
vi.mock("@/server/lib/audit/rendering-policy", () => ({
  isAuditRenderingAllowed: canRenderMock,
}));
vi.mock("@/server/features/audit/repositories/auditResultsQueries", () => ({
  getAuditIssueGroups: issueGroupsMock,
  listAuditIssues: listIssuesMock,
  listAuditLighthouseResults: lighthouseResultsMock,
  listAuditPages: vi.fn(),
}));
// A stored report is named by its key, so a test can tell which one was read.
vi.mock("@/server/lib/r2", () => ({
  getJsonFromR2: async (key: string) => key,
}));
vi.mock("@/server/lib/lighthousePayload", () => ({
  readStoredLighthousePayload: (report: string) => ({
    report: {
      hasIssueDetails: true,
      issues: [
        {
          severity: "critical",
          title: `Issue in ${report}`,
          category: "performance",
          items: [],
        },
      ],
    },
  }),
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
  getAuditLighthouseTool,
  getAuditStatusTool,
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

function refusedAudit(config: Record<string, unknown>) {
  return {
    id: "audit-1",
    projectId: "project-1",
    startUrl: "https://store.example/",
    status: "refused",
    config: JSON.stringify({
      maxPages: 50,
      lighthouseStrategy: "none",
      ...config,
    }),
  };
}

describe("an audit the site refused", () => {
  const PAGES = { ok: 0, blocked: 0, rate_limited: 1, error: 0 };

  async function statusText(config: Record<string, unknown>) {
    auditMock.mockResolvedValue(refusedAudit(config));
    return textContent(
      await getAuditStatusTool.handler(
        { projectId: "project-1", auditId: "audit-1" },
        makeToolContext(),
      ),
    );
  }

  beforeEach(() => {
    pageCountsMock.mockResolvedValue(PAGES);
    canRenderMock.mockResolvedValue(true);
  });

  // Agents act on this sentence alone, so the call and its price are exact.
  it("gives the rendered rerun call and its cost for a Shopify store", async () => {
    expect(
      await statusText({ sitePlatform: "shopify", excludePaths: ["/blogs/"] }),
    ).toBe(
      'Audit audit-1 (https://store.example/): refused. Shopify refused the crawler (429 Too Many Requests) before it read a page, so there are no results. Waiting or a crawler-access signature does not change this. Start it again with renderJavaScript: true, which loads pages in a browser: run_site_audit with projectId "project-1", url "https://store.example/", maxPages 50, renderJavaScript true, excludePaths ["/blogs/"]. Costs up to $0.07.',
    );
  });

  it("doesn't offer rendering to a Shopify audit that already rendered", async () => {
    const text = await statusText({
      sitePlatform: "shopify",
      renderJavaScript: true,
    });

    expect(text).toContain("rendering could not read the pages either");
    expect(text).not.toContain("run_site_audit");
  });

  it("doesn't offer rendering where the deployment has no renderer", async () => {
    canRenderMock.mockResolvedValue(false);

    const text = await statusText({ sitePlatform: "shopify" });

    expect(text).toContain("A later run may get through.");
    expect(text).not.toContain("renderJavaScript");
  });

  it("keeps the allow-the-crawler advice for a 429 from any other site", async () => {
    const text = await statusText({});

    expect(text).toContain("The site rate limited the crawler");
    expect(text).toContain("https://openseo.so/docs/crawler");
    expect(text).not.toContain("run_site_audit");
  });

  it("names bot protection when that is what refused it", async () => {
    pageCountsMock.mockResolvedValue({ ...PAGES, rate_limited: 0, blocked: 1 });

    expect(await statusText({ sitePlatform: "shopify" })).toContain(
      "The site's bot protection blocked the crawler before it read a page",
    );
  });

  it("leads the issue report with the refusal instead of an issue count", async () => {
    latestAuditMock.mockResolvedValue(
      refusedAudit({ sitePlatform: "shopify" }),
    );
    issueGroupsMock.mockResolvedValue([
      { issueType: "rate-limited-page", severity: "warning", count: 1 },
    ]);
    listIssuesMock.mockResolvedValue([]);

    const text = textContent(
      await getAuditIssuesTool.handler(
        { projectId: "project-1" },
        makeToolContext(),
      ),
    );

    expect(text).toMatch(
      /^Audit audit-1 \(https:\/\/store\.example\/\): refused\./,
    );
    expect(text).not.toContain("1 issues across");
  });
});

describe("get_audit_lighthouse", () => {
  beforeEach(() => {
    latestAuditMock.mockResolvedValue({
      id: "audit-1",
      startUrl: "https://example.com",
      lighthouseTotal: 2,
    });
    lighthouseResultsMock.mockResolvedValue(
      (["desktop", "mobile"] as const).map((strategy) => ({
        pageUrl: "https://example.com/",
        strategy,
        r2Key: `${strategy}-report`,
      })),
    );
  });

  it("says an audit ran without Lighthouse instead of returning nothing", async () => {
    latestAuditMock.mockResolvedValue({ id: "audit-1", lighthouseTotal: 0 });
    lighthouseResultsMock.mockResolvedValue([]);

    const result = await getAuditLighthouseTool.handler(
      { projectId: "project-1" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain("ran without Lighthouse");
  });

  it("lists a page's mobile issues unless another device is asked for", async () => {
    const result = await getAuditLighthouseTool.handler(
      { projectId: "project-1", url: "https://example.com/" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain("Issue in mobile-report");
    expect(textContent(result)).not.toContain("desktop-report");
  });
});
