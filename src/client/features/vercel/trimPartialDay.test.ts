import { describe, expect, it } from "vitest";
import { trimTrailingPartialDay } from "./trimPartialDay";

function day(key: string) {
  return { key, visitors: 10, pageviews: 20 };
}

describe("trimTrailingPartialDay", () => {
  const now = new Date("2026-07-26T14:30:00.000Z");

  it("drops today's partial bucket and any empty tomorrow bucket", () => {
    const rows = [
      day("2026-07-24T00:00:00.000Z"),
      day("2026-07-25T00:00:00.000Z"),
      day("2026-07-26T00:00:00.000Z"),
      day("2026-07-27T00:00:00.000Z"),
    ];
    expect(trimTrailingPartialDay(rows, now).map((row) => row.key)).toEqual([
      "2026-07-24T00:00:00.000Z",
      "2026-07-25T00:00:00.000Z",
    ]);
  });

  it("keeps yesterday even just after midnight UTC", () => {
    const justPastMidnight = new Date("2026-07-26T00:05:00.000Z");
    const rows = [
      day("2026-07-25T00:00:00.000Z"),
      day("2026-07-26T00:00:00.000Z"),
    ];
    expect(trimTrailingPartialDay(rows, justPastMidnight)).toEqual([
      day("2026-07-25T00:00:00.000Z"),
    ]);
  });

  it("drops rows with unparseable keys", () => {
    const rows = [day("2026-07-24T00:00:00.000Z"), day("")];
    expect(trimTrailingPartialDay(rows, now)).toEqual([
      day("2026-07-24T00:00:00.000Z"),
    ]);
  });

  it("returns empty for an all-today series", () => {
    expect(
      trimTrailingPartialDay([day("2026-07-26T00:00:00.000Z")], now),
    ).toEqual([]);
  });
});
