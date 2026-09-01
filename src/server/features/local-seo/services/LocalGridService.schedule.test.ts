import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { computeNextLocalGridScanAt } from "./LocalGridService";

describe("computeNextLocalGridScanAt", () => {
  const now = new Date("2026-01-31T12:00:00.000Z");

  it("supports manual and future calendar schedules", () => {
    expect(computeNextLocalGridScanAt("manual", now)).toBeNull();
    expect(computeNextLocalGridScanAt("weekly", now)).toBe(
      "2026-02-07T12:00:00.000Z",
    );
    expect(computeNextLocalGridScanAt("monthly", now)).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });
});
