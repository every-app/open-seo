import { describe, expect, it } from "vitest";
import {
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
  MAX_USER_AUDIT_USAGE,
} from "@/server/features/audit/services/audit-capacity";

describe("audit capacity helpers", () => {
  it("clamps max pages into the supported range", () => {
    expect(clampAuditMaxPages()).toBe(50);
    expect(clampAuditMaxPages(1)).toBe(10);
    expect(clampAuditMaxPages(500)).toBe(500);
    expect(clampAuditMaxPages(20_000)).toBe(10_000);
  });

  it("estimates capacity for each psi strategy", () => {
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, psiStrategy: "none" }),
    ).toEqual({
      pagesTotal: 100,
      psiTotal: 0,
      total: 100,
    });
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, psiStrategy: "manual" }),
    ).toEqual({
      pagesTotal: 100,
      psiTotal: 0,
      total: 100,
    });
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, psiStrategy: "auto" }),
    ).toEqual({
      pagesTotal: 100,
      psiTotal: 20,
      total: 120,
    });
    expect(
      getEstimatedAuditCapacity({ maxPages: 100, psiStrategy: "all" }),
    ).toEqual({
      pagesTotal: 100,
      psiTotal: 200,
      total: 300,
    });
  });

  it("stays within the global capacity limit for the maximum auto audit", () => {
    expect(
      getEstimatedAuditCapacity({ maxPages: 10_000, psiStrategy: "auto" })
        .total,
    ).toBeLessThan(MAX_USER_AUDIT_USAGE);
  });
});
