import { describe, expect, it } from "vitest";
import { formatBingDay } from "./formatBingDay";

describe("formatBingDay", () => {
  // Bing reports day buckets as midnight US Pacific, so the ISO instant is
  // 07:00Z or 08:00Z depending on daylight saving. Reading that in a viewer's
  // local timezone shifts the label a day west of UTC-8.
  const PST_BUCKET = "2026-02-09T08:00:00.000Z"; // 9 Feb, PST (-0800)
  const PDT_BUCKET = "2026-03-09T07:00:00.000Z"; // 9 Mar, PDT (-0700)

  it("keeps the bucket's own day regardless of the viewer's timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["Pacific/Honolulu", "America/Anchorage", "UTC"]) {
        process.env.TZ = tz;
        expect(formatBingDay(PST_BUCKET)).toContain("9");
        expect(formatBingDay(PST_BUCKET)).toContain("Feb");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("handles both daylight-saving offsets Bing sends", () => {
    expect(formatBingDay(PDT_BUCKET)).toContain("Mar");
    expect(formatBingDay(PDT_BUCKET)).toContain("9");
  });

  it("shows a placeholder rather than inventing a date", () => {
    expect(formatBingDay(null)).toBe("—");
    expect(formatBingDay("not-a-date")).toBe("—");
  });
});
