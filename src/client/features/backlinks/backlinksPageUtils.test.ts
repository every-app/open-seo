import { describe, expect, it } from "vitest";
import { truncateMiddle } from "./backlinksPageUtils";

describe("truncateMiddle", () => {
  it("never returns a string longer than maxLength", () => {
    const value = "/very/long/path/segment/that/keeps/going/here";
    for (let maxLength = 0; maxLength <= value.length; maxLength++) {
      expect(truncateMiddle(value, maxLength).length).toBeLessThanOrEqual(
        maxLength,
      );
    }
  });

  it("keeps head and tail around a middle ellipsis", () => {
    expect(truncateMiddle("abcdefghijklmno", 10)).toBe("abc...mno");
    expect(truncateMiddle("/very/long/path/segment/here", 12)).toBe(
      "/ver...here",
    );
  });
});
