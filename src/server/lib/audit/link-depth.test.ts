import { describe, expect, it } from "vitest";
import { isShallowerLink } from "@/server/lib/audit/link-depth";

describe("isShallowerLink", () => {
  it("takes the first link to a target", () => {
    expect(isShallowerLink(undefined, 3)).toBe(true);
    expect(isShallowerLink(undefined, null)).toBe(true);
  });

  it("replaces a deeper depth with a shallower one, never the reverse", () => {
    expect(isShallowerLink(3, 1)).toBe(true);
    expect(isShallowerLink(1, 3)).toBe(false);
    expect(isShallowerLink(2, 2)).toBe(false);
  });

  it("lets a depth replace a null one, never the reverse", () => {
    expect(isShallowerLink(null, 1)).toBe(true);
    expect(isShallowerLink(1, null)).toBe(false);
    expect(isShallowerLink(null, null)).toBe(false);
  });
});
