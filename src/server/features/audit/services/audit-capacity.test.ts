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

  // If a tier's largest auto audit doesn't fit its own capacity budget, every
  // max-size audit on that tier is rejected right after insert.
  it.each(["free", "paid"] as const)(
    "fits the maximum %s auto audit within its capacity budget",
    (tier) => {
      const estimate = getEstimatedAuditCapacity({
        maxPages: AUDIT_LIMITS[tier].maxPagesPerAudit,
        lighthouseStrategy: "auto",
      });
      expect(estimate.pagesTotal).toBe(AUDIT_LIMITS[tier].maxPagesPerAudit);
      expect(estimate.total).toBeLessThan(AUDIT_LIMITS[tier].maxCapacityUnits);
    },
  );
});
