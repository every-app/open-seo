import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workflowCreate:
    vi.fn<(options: { params: { renderLocks?: unknown } }) => Promise<void>>(),
  deleteAudit: vi.fn(),
  renderingAllowed: vi.fn(),
  lock: vi.fn(),
  release: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    SITE_AUDIT_WORKFLOW: {
      create: mocks.workflowCreate,
      get: vi.fn().mockRejectedValue(new Error("No instance")),
    },
  },
}));
vi.mock("@/server/lib/audit/rendering-policy", () => ({
  isAuditRenderingAllowed: mocks.renderingAllowed,
}));
vi.mock("@/server/lib/audit/rendering-billing", () => ({
  lockRenderingCredits: mocks.lock,
  releaseRenderingLocks: mocks.release,
}));
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: async (url: string) => url,
  resolveStartUrlRedirects: async (url: string) => ({ url }),
}));
vi.mock("@/server/features/audit/services/CrawlerCredentialService", () => ({
  CrawlerCredentialService: {
    resolveCrawlerAccess: vi.fn().mockResolvedValue(null),
    openCrawlerAccess: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    createAudit: vi.fn(),
    getAuditUsageForOrganization: vi
      .fn()
      .mockResolvedValue({ runningCount: 1, capacityUnits: 0 }),
    deleteAuditForProject: mocks.deleteAudit,
  },
}));
vi.mock("@/server/billing/subscription", () => ({}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));

import { AuditService } from "@/server/features/audit/services/AuditService";
import { AppError } from "@/server/lib/errors";

const locks = [
  {
    lockId: "lock",
    featureId: "usage_credits" as const,
    estimatedCredits: 384,
  },
];
const renderedAudit = {
  actorUserId: "user-1",
  billingCustomer: {
    userId: "user-1",
    userEmail: "user@example.com",
    organizationId: "org-1",
  },
  projectId: "project-1",
  startUrl: "https://example.com/",
  maxPages: 100,
  renderJavaScript: true,
  limitTier: "paid" as const,
};

describe("rendered audit start", () => {
  beforeEach(() => {
    mocks.renderingAllowed.mockResolvedValue(true);
    mocks.lock.mockResolvedValue(locks);
  });

  it("rejects rendering where the deployment cannot provide it, saying why", async () => {
    mocks.renderingAllowed.mockResolvedValue(false);
    const error = await AuditService.startAudit(renderedAudit).catch(
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code: "AUDIT_RENDERING_UNAVAILABLE" });
    // MCP clients see this message as the tool's answer.
    expect(String(error)).toContain("CONTEXT_API_KEY");
    expect(mocks.lock).not.toHaveBeenCalled();
  });

  it("holds the audit's worst case and hands the locks to the workflow", async () => {
    await AuditService.startAudit(renderedAudit);
    expect(mocks.lock).toHaveBeenCalledWith(
      expect.objectContaining({ maxPages: 100 }),
    );
    expect(mocks.workflowCreate.mock.calls[0][0].params.renderLocks).toEqual(
      locks,
    );
  });

  it("refuses more than 1,000 rendered pages on a paid plan before holding credits", async () => {
    const error = await AuditService.startAudit({
      ...renderedAudit,
      maxPages: 1_001,
    }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "AUDIT_PAGE_LIMIT_EXCEEDED" });
    expect(String(error)).toContain("limited to 1,000 pages");
    expect(mocks.lock).not.toHaveBeenCalled();
  });

  it("does not start an audit the organization cannot cover", async () => {
    mocks.lock.mockRejectedValue(new AppError("INSUFFICIENT_CREDITS"));
    await expect(AuditService.startAudit(renderedAudit)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect(mocks.workflowCreate).not.toHaveBeenCalled();
    expect(mocks.deleteAudit).toHaveBeenCalled();
  });

  it("returns the hold when the workflow cannot start", async () => {
    mocks.workflowCreate.mockRejectedValue(new Error("Workflow unavailable"));
    await expect(AuditService.startAudit(renderedAudit)).rejects.toThrow(
      "Workflow unavailable",
    );
    expect(mocks.release).toHaveBeenCalledWith(locks);
  });
});
