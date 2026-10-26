import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SealedCrawlerAccess } from "@/server/features/audit/services/CrawlerCredentialService";

const {
  SECRET,
  createAuditMock,
  usageMock,
  findCredentialMock,
  workflowCreateMock,
} = vi.hoisted(() => ({
  SECRET: "test-secret-that-is-at-least-32-chars",
  createAuditMock: vi.fn<
    (input: {
      config: {
        sitePlatform?: string;
        crawlerCredentialId?: string;
        [key: string]: unknown;
      };
    }) => Promise<void>
  >(),
  usageMock: vi.fn(),
  findCredentialMock: vi.fn(),
  workflowCreateMock: vi.fn<
    (options: {
      params: {
        startUrl: string;
        config: { maxPages: number; lighthouseStrategy: "none" };
        access?: SealedCrawlerAccess | null;
      };
    }) => Promise<void>
  >(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { SITE_AUDIT_WORKFLOW: { create: workflowCreateMock } },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn().mockResolvedValue(false),
  getOptionalEnvValue: vi.fn(async (name: string) =>
    name === "CRAWLER_ACCESS_SECRET" ? SECRET : undefined,
  ),
}));
vi.mock("@/server/email/onboarding-drip", () => ({
  markOnboardingMilestone: vi.fn(),
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasManagedAccess: vi.fn(),
  customerHasPaidPlan: vi.fn(),
  getOrCreateOrganizationCustomer: vi.fn(),
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    createAudit: createAuditMock,
    updateAuditStart: vi.fn(),
    getAuditUsageForOrganization: usageMock,
  },
}));
vi.mock(
  "@/server/features/audit/repositories/CrawlerCredentialRepository",
  () => ({
    CrawlerCredentialRepository: {
      findForOrganizationAndHost: findCredentialMock,
    },
  }),
);
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));

import { symmetricEncrypt } from "better-auth/crypto";
import { AuditService } from "@/server/features/audit/services/AuditService";
import { resolveAuditStart } from "@/server/workflows/siteAuditStart";

async function credentialRow(expiresAt: string | null) {
  return {
    id: "cred-1",
    host: "store.example.com",
    signatureInput: await symmetricEncrypt({ key: SECRET, data: "sig1=(...)" }),
    signature: await symmetricEncrypt({ key: SECRET, data: "sig1=:abc:" }),
    expiresAt,
  };
}

function probeSignature() {
  const probe = vi
    .mocked(fetch)
    .mock.calls.find(
      (call) =>
        typeof call[0] === "string" && call[0].startsWith("https://store."),
    );
  return new Headers(probe?.[1]?.headers).get("signature");
}

const input = {
  actorUserId: "user-1",
  billingCustomer: {
    userId: "user-1",
    userEmail: "user@example.com",
    organizationId: "org-1",
  },
  projectId: "project-1",
  startUrl: "https://store.example.com",
  limitTier: "self_hosted" as const,
};

// Starts the audit, then runs the workflow's first step on what it was given.
async function startAndResolve() {
  await AuditService.startAudit(input);
  const { params } = workflowCreateMock.mock.calls[0][0];
  return resolveAuditStart({
    auditId: "audit-1",
    organizationId: "org-1",
    projectId: "project-1",
    startUrl: params.startUrl,
    config: params.config,
    access: params.access,
  });
}

describe("audit crawler access", () => {
  beforeEach(async () => {
    usageMock.mockResolvedValue({ runningCount: 0, capacityUnits: 0 });
    findCredentialMock.mockResolvedValue([await credentialRow(null)]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).includes("dns-query")
            ? new Response(JSON.stringify({ Status: 0, Answer: [] }), {
                status: 200,
              })
            : new Response(null, {
                status: 200,
                headers: { "powered-by": "Shopify" },
              }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records the Shopify platform and keeps the signature encrypted at rest", async () => {
    const resolved = await startAndResolve();

    expect(probeSignature()).toBe("sig1=:abc:");
    expect(resolved.config.sitePlatform).toBe("shopify");
    expect(resolved.config.crawlerCredentialId).toBe("cred-1");
    // The audit row's config, the workflow params and the step result are all
    // persisted, so none may carry the plaintext values.
    const params = workflowCreateMock.mock.calls[0][0].params;
    const rowConfig = createAuditMock.mock.calls[0][0].config;
    expect(JSON.stringify([rowConfig, params, resolved])).not.toContain("sig1");
    expect(params.access).toMatchObject({ host: "store.example.com" });
  });

  it("records a signed store as Shopify when the probe itself is throttled", async () => {
    // Shopify's edge 429 carries no `powered-by` header.
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 429 })),
    );

    const resolved = await startAndResolve();

    expect(resolved.config.sitePlatform).toBe("shopify");
  });

  it("does not replay an expired signature", async () => {
    findCredentialMock.mockResolvedValue([
      await credentialRow("2020-01-01T00:00:00.000Z"),
    ]);

    await startAndResolve();

    expect(probeSignature()).toBeNull();
    expect(
      createAuditMock.mock.calls[0][0].config.crawlerCredentialId,
    ).toBeUndefined();
    expect(workflowCreateMock.mock.calls[0][0].params.access).toBeUndefined();
  });
});
