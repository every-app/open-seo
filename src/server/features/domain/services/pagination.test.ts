import { describe, expect, it } from "vitest";
import { computeHasMore } from "@/server/features/domain/services/pagination";

describe("computeHasMore", () => {
  it("uses totalCount against the raw fetched offset when known", () => {
    expect(computeHasMore(0, 100, 250, 100)).toBe(true);
    expect(computeHasMore(200, 50, 250, 100)).toBe(false);
  });

  it("returns false for a full page whose fetched count reaches totalCount", () => {
    expect(computeHasMore(0, 100, 100, 100)).toBe(false);
  });

  it("falls back to a full-page check when totalCount is unknown", () => {
    expect(computeHasMore(0, 100, null, 100)).toBe(true);
    expect(computeHasMore(0, 100, undefined, 100)).toBe(true);
    expect(computeHasMore(100, 40, null, 100)).toBe(false);
  });
});
