import { describe, expect, it } from "vitest";
import {
  AUDIT_LIMITS,
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
} from "@/server/features/audit/services/audit-capacity";

describe("audit capacity helpers", () => {
  it("clamps max pages into the supported range", () => {
    expect(clampAuditMaxPages()).toBe(50);
    expect(clampAuditMaxPages(1)).toBe(10);
    expect(clampAuditMaxPages(500)).toBe(500);
    expect(clampAuditMaxPages(20_000)).toBe(10_000);
  });

  it("estimates capacity for each lighthouse strategy", () => {
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, lighthouseStrategy: "none" }),
    ).toEqual({
      pagesTotal: 100,
      lighthouseTotal: 0,
      total: 100,
    });
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, lighthouseStrategy: "auto" }),
    ).toEqual({
      pagesTotal: 100,
      lighthouseTotal: 20,
      total: 120,
    });
  });

  it("stays within the paid capacity limit for the maximum auto audit", () => {
    expect(
      getEstimatedAuditCapacity({
        maxPages: 10_000,
        lighthouseStrategy: "auto",
      }).total,
    ).toBeLessThan(AUDIT_LIMITS.paid.maxCapacityUnits);
  });

  it("fits a maximum free audit within the free capacity budget", () => {
    const freeAudit = getEstimatedAuditCapacity({
      maxPages: AUDIT_LIMITS.free.maxPagesPerAudit,
      lighthouseStrategy: "auto",
    });
    expect(freeAudit.pagesTotal).toBe(AUDIT_LIMITS.free.maxPagesPerAudit);
    expect(freeAudit.total).toBeLessThan(AUDIT_LIMITS.free.maxCapacityUnits);
  });
});
