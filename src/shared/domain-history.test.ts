import { describe, expect, it } from "vitest";
import {
  countInclusiveMonths,
  dateMonthsAgo,
  estimateDomainHistoryCostUsd,
} from "@/shared/domain-history";

describe("domain history estimates", () => {
  it("counts inclusive calendar months and estimates one task per domain", () => {
    expect(countInclusiveMonths("2024-10-01", "2026-09-06")).toBe(24);
    expect(
      estimateDomainHistoryCostUsd(3, "2024-10-01", "2026-09-06"),
    ).toBeCloseTo(0.4464);
  });

  it("builds an inclusive period start", () => {
    expect(dateMonthsAgo(24, new Date("2026-09-06T00:00:00Z"))).toBe(
      "2024-10-01",
    );
  });
});
