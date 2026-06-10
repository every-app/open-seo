import { describe, expect, it } from "vitest";
import { toSqliteTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";

describe("rank tracking snapshot queries", () => {
  it("formats comparison cutoffs like SQLite current_timestamp", () => {
    expect(toSqliteTimestamp(new Date("2026-06-09T12:34:56.789Z"))).toBe(
      "2026-06-09 12:34:56",
    );
  });
});
