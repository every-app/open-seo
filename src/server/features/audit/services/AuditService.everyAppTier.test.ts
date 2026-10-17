import { describe, expect, it, vi } from "vitest";
import { AUDIT_LIMITS } from "./audit-capacity";

const { workerEnv, getOrCreateCustomerMock, hasPaidPlanMock } = vi.hoisted(
  () => ({
    workerEnv: { AUTH_MODE: "everyapp" } as Record<string, string>,
    getOrCreateCustomerMock: vi.fn(),
    hasPaidPlanMock: vi.fn(),
  }),
);

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
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

describe("resolveAuditLimitTier behind an Every App gateway", () => {
  it("bounds audits per organization in both Every App shapes, without Autumn", async () => {
    for (const pin of [undefined, "org-1"]) {
      if (pin) workerEnv.EVERY_APP_ORG_ID = pin;
      await expect(AuditService.resolveAuditLimitTier(customer)).resolves.toBe(
        "every_app",
      );
    }
    expect(getOrCreateCustomerMock).not.toHaveBeenCalled();
    expect(hasPaidPlanMock).not.toHaveBeenCalled();
  });

  it("allows a few audits at a time, not the self-host tier's unlimited ones", () => {
    expect(AUDIT_LIMITS.every_app.maxRunningAudits).toBe(2);
    expect(AUDIT_LIMITS.every_app.maxCapacityUnits).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
    expect(AUDIT_LIMITS.every_app.maxPagesPerAudit).toBe(
      AUDIT_LIMITS.paid.maxPagesPerAudit,
    );
  });
});
