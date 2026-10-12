import { beforeEach, describe, expect, it, vi } from "vitest";

const { isHostedMock, hasPaidPlanMock, getOrCreateCustomerMock } = vi.hoisted(
  () => ({
    isHostedMock: vi.fn(),
    hasPaidPlanMock: vi.fn(),
    getOrCreateCustomerMock: vi.fn(),
  }),
);

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedMock,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: hasPaidPlanMock,
  getOrCreateOrganizationCustomer: getOrCreateCustomerMock,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {},
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));

import { AuditService } from "@/server/features/audit/services/AuditService";

const customer = {
  organizationId: "org-1",
  userEmail: "user@example.com",
  userId: "user-1",
};

describe("resolveAuditLimitTier", () => {
  beforeEach(() => {
    hasPaidPlanMock.mockResolvedValue(true);
  });

  it("uses the uncapped self-hosted tier without consulting billing", async () => {
    isHostedMock.mockResolvedValue(false);

    await expect(AuditService.resolveAuditLimitTier(customer)).resolves.toBe(
      "self_hosted",
    );
    expect(getOrCreateCustomerMock).not.toHaveBeenCalled();
    expect(hasPaidPlanMock).not.toHaveBeenCalled();
  });

  it("ensures the Autumn customer before checking entitlements in hosted mode", async () => {
    isHostedMock.mockResolvedValue(true);

    await expect(AuditService.resolveAuditLimitTier(customer)).resolves.toBe(
      "paid",
    );
    expect(getOrCreateCustomerMock).toHaveBeenCalledWith(customer);
  });
});

it("allows a hosted account without a paid subscription through the free audit tier", async () => {
  isHostedMock.mockResolvedValue(true);
  hasPaidPlanMock.mockResolvedValue(false);
  await expect(AuditService.resolveAuditLimitTier(customer)).resolves.toBe(
    "free",
  );
});
