import { describe, expect, it } from "vitest";
import { parseStoredTimestamp } from "./stored-timestamps";

describe("parseStoredTimestamp", () => {
  it("treats SQLite current_timestamp values as UTC", () => {
    expect(parseStoredTimestamp("2026-07-20 00:30:00")?.toISOString()).toBe(
      "2026-07-20T00:30:00.000Z",
    );
  });

  it("preserves ISO timestamps from Postgres", () => {
    expect(
      parseStoredTimestamp("2026-07-20T00:30:00.789Z")?.toISOString(),
    ).toBe("2026-07-20T00:30:00.789Z");
  });

  it("returns null for invalid timestamps", () => {
    expect(parseStoredTimestamp("not-a-timestamp")).toBeNull();
  });
});
