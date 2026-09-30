import { beforeEach, describe, expect, it, vi } from "vitest";

const getDatabaseProvider = vi.hoisted(() =>
  vi.fn((): "d1" | "postgres" => "d1"),
);

vi.mock("@/db/provider", () => ({
  getDatabaseProvider,
}));

import {
  toRankTrackingCutoffTimestamp,
  toSqliteTimestamp,
} from "@/server/features/rank-tracking/rankTrackingTimestamps";

describe("rank tracking timestamp cutoffs", () => {
  beforeEach(() => {
    getDatabaseProvider.mockReturnValue("d1");
  });

  it("formats SQLite cutoffs like current_timestamp", () => {
    expect(toSqliteTimestamp(new Date("2026-06-09T12:34:56.789Z"))).toBe(
      "2026-06-09 12:34:56",
    );
    expect(
      toRankTrackingCutoffTimestamp(new Date("2026-06-09T12:34:56.789Z")),
    ).toBe("2026-06-09 12:34:56");
  });

  it("formats Postgres cutoffs as ISO text to match isoNow storage", () => {
    getDatabaseProvider.mockReturnValue("postgres");
    expect(
      toRankTrackingCutoffTimestamp(new Date("2026-06-09T12:34:56.789Z")),
    ).toBe("2026-06-09T12:34:56.789Z");
  });
});
