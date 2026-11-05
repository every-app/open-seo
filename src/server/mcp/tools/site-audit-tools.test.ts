import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hasPaidPlanMock, workflowCreateMock, captureEventMock } = vi.hoisted(
  () => ({
    hasPaidPlanMock: vi.fn(),
    workflowCreateMock:
      vi.fn<
        (options: { params: { config: { maxPages: number } } }) => Promise<void>
      >(),
    captureEventMock:
      vi.fn<
        (event: { properties: Record<string, unknown> }) => Promise<void>
      >(),
  }),
);

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
  },
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

import { runSiteAuditTool } from "@/server/mcp/tools/site-audit-tools";
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
