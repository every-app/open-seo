import { describe, expect, it } from "vitest";
import { computeHasMore } from "@/server/features/domain/services/pagination";

describe("computeHasMore", () => {
  it.each([
    // offset, fetched, totalCount, pageSize
    [0, 100, 250, 100, true],
    [200, 50, 250, 100, false],
    // A full last page: fetched count reaches totalCount exactly.
    [0, 100, 100, 100, false],
    // Unknown total: fall back to "was the page full".
    [0, 100, null, 100, true],
    [0, 100, undefined, 100, true],
    [100, 40, null, 100, false],
  ])(
    "computeHasMore(%i, %i, %s, %i) is %s",
    (offset, fetched, totalCount, pageSize, expected) => {
      expect(computeHasMore(offset, fetched, totalCount, pageSize)).toBe(
        expected,
      );
    },
  );
});
