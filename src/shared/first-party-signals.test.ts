import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_RETENTION_DAYS,
  firstPartyOldestRetainedSnapshotDate,
} from "./first-party-signals";

describe("first-party snapshot retention", () => {
  it("returns a window containing exactly 400 inclusive UTC dates", () => {
    const now = new Date("2026-09-04T23:59:59.999Z");
    const oldest = firstPartyOldestRetainedSnapshotDate(now);
    const elapsedDays =
      (Date.parse("2026-09-04T00:00:00.000Z") -
        Date.parse(`${oldest}T00:00:00.000Z`)) /
      (24 * 60 * 60 * 1_000);

    expect(oldest).toBe("2025-08-01");
    expect(elapsedDays + 1).toBe(FIRST_PARTY_RETENTION_DAYS);
  });
});
