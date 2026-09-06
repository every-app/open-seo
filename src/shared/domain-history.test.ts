import { describe, expect, it } from "vitest";
import {
  countInclusiveMonths,
  dateMonthsAgo,
  estimateDomainHistoryCostUsd,
} from "@/shared/domain-history";
import { domainHistoryRequestSchema } from "@/types/schemas/domain";

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

  it("accepts domains and subdomains but rejects folder targets", () => {
    const base = {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2024-10-01",
      dateTo: "2026-09-06",
    };
    expect(
      domainHistoryRequestSchema.parse({
        ...base,
        domains: ["https://www.example.com/", "docs.example.com"],
      }).domains,
    ).toEqual(["example.com", "docs.example.com"]);

    const folder = domainHistoryRequestSchema.safeParse({
      ...base,
      domains: ["https://www.cdata.com/jp/"],
    });
    expect(folder.success).toBe(false);
    if (!folder.success) {
      expect(folder.error.issues[0]?.message).toContain("folder paths");
    }
  });
});
