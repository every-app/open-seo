import { beforeEach, describe, expect, it, vi } from "vitest";

const { isHostedMock, hasManagedAccessMock, hasPaidPlanMock } = vi.hoisted(
  () => ({
    isHostedMock: vi.fn(),
    hasManagedAccessMock: vi.fn(),
    hasPaidPlanMock: vi.fn(),
  }),
);

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedMock,
}));

vi.mock("@/server/billing/subscription", () => ({
  customerHasManagedAccess: hasManagedAccessMock,
  customerHasPaidPlan: hasPaidPlanMock,
}));

// Pulled in transitively by AuditService; stubbed so the tier resolver can be
// exercised without a database or a KV binding.
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {},
}));

vi.mock("@/server/lib/audit/progress-kv", () => ({
  AuditProgressKV: {},
}));

import { AuditService } from "@/server/features/audit/services/AuditService";
import { AppError } from "@/server/lib/errors";

describe("resolveAuditLimitTier", () => {
  beforeEach(() => {
    hasManagedAccessMock.mockResolvedValue(true);
    hasPaidPlanMock.mockResolvedValue(true);
  });

  it("resolves self-hosted deploys to the self_hosted tier", async () => {
    isHostedMock.mockResolvedValue(false);

    await expect(AuditService.resolveAuditLimitTier("org_1")).resolves.toBe(
      "self_hosted",
    );
    // Self-hosted has no Autumn balance, so billing must not be consulted.
    expect(hasManagedAccessMock).not.toHaveBeenCalled();
    expect(hasPaidPlanMock).not.toHaveBeenCalled();
  });

  it("resolves a hosted subscriber to the paid tier", async () => {
    isHostedMock.mockResolvedValue(true);

    await expect(AuditService.resolveAuditLimitTier("org_1")).resolves.toBe(
      "paid",
    );
  });

  it("resolves a hosted account without a paid plan to the free tier", async () => {
    isHostedMock.mockResolvedValue(true);
    hasPaidPlanMock.mockResolvedValue(false);

    await expect(AuditService.resolveAuditLimitTier("org_1")).resolves.toBe(
      "free",
    );
  });

  it("rejects a hosted account with no managed access", async () => {
    isHostedMock.mockResolvedValue(true);
    hasManagedAccessMock.mockResolvedValue(false);

    const rejection = AuditService.resolveAuditLimitTier("org_1");
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toHaveProperty("code", "PAYMENT_REQUIRED");
  });
});
