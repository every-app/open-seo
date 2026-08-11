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
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {},
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));

import { AuditService } from "@/server/features/audit/services/AuditService";

describe("resolveAuditLimitTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasManagedAccessMock.mockResolvedValue(true);
    hasPaidPlanMock.mockResolvedValue(true);
  });

  it("uses the uncapped self-hosted tier without consulting billing", async () => {
    isHostedMock.mockResolvedValue(false);

    await expect(AuditService.resolveAuditLimitTier("org-1")).resolves.toBe(
      "self_hosted",
    );
    expect(hasManagedAccessMock).not.toHaveBeenCalled();
    expect(hasPaidPlanMock).not.toHaveBeenCalled();
  });
});
