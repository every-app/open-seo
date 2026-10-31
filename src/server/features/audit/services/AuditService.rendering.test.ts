import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RenderingPolicy from "@/server/lib/audit/rendering-policy";

const mocks = vi.hoisted(() => {
  const workflowCreate =
    vi.fn<(options: { params: { renderLocks?: unknown } }) => Promise<void>>();
  return {
    workflowCreate,
    deleteAudit: vi.fn(),
    renderingAllowed: vi.fn(),
    lock: vi.fn(),
    release: vi.fn(),
    env: {
      SITE_AUDIT_WORKFLOW: {
        create: workflowCreate,
        get: vi.fn().mockRejectedValue(new Error("No instance")),
      },
    } as Record<string, unknown>,
  };
});

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
// The check is mocked; the message it comes with is the real one, which
// reads AUTH_MODE from the env above.
vi.mock("@/server/lib/audit/rendering-policy", async (importOriginal) => ({
  ...(await importOriginal<typeof RenderingPolicy>()),
  isAuditRenderingAllowed: mocks.renderingAllowed,
}));
vi.mock("@/server/lib/audit/rendering-billing", () => ({
  lockRenderingCredits: mocks.lock,
  releaseRenderingLocks: mocks.release,
}));
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: async (url: string) => url,
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

  it("behind an Every App gateway, says the key is the gateway's and how an admin sets it", async () => {
    mocks.renderingAllowed.mockResolvedValue(false);
    mocks.env.AUTH_MODE = "everyapp";
    try {
      const error = await AuditService.startAudit(renderedAudit).catch(
        (reason: unknown) => reason,
      );
      expect(error).toMatchObject({ code: "AUDIT_RENDERING_UNAVAILABLE" });
      expect(String(error)).toContain(
        "JavaScript rendering isn't set up on your Every App gateway yet. An owner or admin sets it with pnpm everyapp secret set CONTEXT_API_KEY.",
      );
      expect(mocks.lock).not.toHaveBeenCalled();
    } finally {
      delete mocks.env.AUTH_MODE;
    }
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
