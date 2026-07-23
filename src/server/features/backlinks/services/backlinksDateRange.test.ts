import { describe, expect, it } from "vitest";
import { buildBacklinksDateRange } from "@/server/features/backlinks/services/backlinksDateRange";

describe("buildBacklinksDateRange", () => {
  it("spans one year ending yesterday", () => {
    expect(buildBacklinksDateRange(new Date("2025-06-16T00:00:00Z"))).toEqual({
      dateFrom: "2024-06-15",
      dateTo: "2025-06-15",
    });
  });

  it("clamps to the last valid day when yesterday is a leap day", () => {
    expect(buildBacklinksDateRange(new Date("2024-03-01T00:00:00Z"))).toEqual({
      dateFrom: "2023-02-28",
      dateTo: "2024-02-29",
    });
  });

  it("keeps a full-year span for a non-leap February end", () => {
    expect(buildBacklinksDateRange(new Date("2025-03-01T00:00:00Z"))).toEqual({
      dateFrom: "2024-02-28",
      dateTo: "2025-02-28",
    });
  });
});
