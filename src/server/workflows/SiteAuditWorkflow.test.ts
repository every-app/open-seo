import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { runAuditPhases } from "./siteAuditWorkflowPhases";

const mocks = vi.hoisted(() => ({
  runAuditPhases: vi.fn<typeof runAuditPhases>(),
  settle: vi.fn(),
  failAudit: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: vi.fn() }));
vi.mock("@/db", () => ({ withPgClient: (fn: () => unknown) => fn() }));
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock("@/server/workflows/siteAuditWorkflowPhases", () => ({
  runAuditPhases: mocks.runAuditPhases,
}));
vi.mock("@/server/lib/audit/rendering-billing", () => ({
  settleRenderingLocks: mocks.settle,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditForWorkflow: vi
      .fn()
      .mockResolvedValue({ projectId: "project", currentPhase: "crawling" }),
    failAudit: mocks.failAudit,
  },
}));
vi.mock("@/server/features/audit/services/CrawlerCredentialService", () => ({
  CrawlerCredentialService: { openCrawlerAccess: vi.fn() },
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerError: vi.fn(),
  captureServerEvent: vi.fn(),
}));

import { SiteAuditWorkflow } from "./SiteAuditWorkflow";

const locks = [
  {
    lockId: "lock",
    featureId: "usage_credits" as const,
    estimatedCredits: 384,
    callIndexes: [],
  },
];
const step = {
  do: (_name: string, _config: unknown, fn: () => unknown) => fn(),
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only step.do is reached; pgStep is mocked
} as unknown as WorkflowStep;

function run() {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect Worker constructor context
  const workflow = new SiteAuditWorkflow({} as ExecutionContext, {} as Env);
  return workflow.run(
    {
      instanceId: "audit",
      timestamp: new Date(),
      payload: {
        auditId: "audit",
        billingCustomer: {
          userId: "user",
          userEmail: "user@example.com",
          organizationId: "org",
        },
        projectId: "project",
        startUrl: "https://example.com/",
        config: { maxPages: 100, lighthouseStrategy: "none" },
        renderLocks: locks,
      },
    },
    step,
  );
}

describe("rendered audit settlement", () => {
  beforeEach(() => {
    mocks.runAuditPhases.mockImplementation(async (_step, params) => {
      params.renderUsage.cloudflareAttempts += 3;
      params.renderUsage.contextCredits += 1;
    });
  });

  it("settles the lock once with what the audit rendered", async () => {
    await run();
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        locks,
        usage: { cloudflareAttempts: 3, contextCredits: 1 },
      }),
    );
  });

  it("settles what a failed audit rendered before it failed", async () => {
    mocks.runAuditPhases.mockImplementation(async (_step, params) => {
      params.renderUsage.cloudflareAttempts += 3;
      throw new Error("crawl failed");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(run()).rejects.toThrow("crawl failed");
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { cloudflareAttempts: 3, contextCredits: 0 },
      }),
    );
  });

  it("does not mark a completed audit failed when settlement fails", async () => {
    mocks.settle.mockRejectedValue(new Error("settle step timed out"));
    await expect(run()).rejects.toThrow("settle step timed out");
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.failAudit).not.toHaveBeenCalled();
  });
});
