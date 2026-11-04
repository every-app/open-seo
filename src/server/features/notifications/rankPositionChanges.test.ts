import { describe, expect, it } from "vitest";
import {
  computeRankPositionChanges,
  rankDistance,
} from "./rankPositionChanges";

describe("rankPositionChanges", () => {
  it("treats missing positions as beyond serp depth", () => {
    expect(rankDistance(null, 20)).toBe(21);
    expect(rankDistance(5, 20)).toBe(5);
  });

  it("returns changes at or above the threshold", () => {
    const changes = computeRankPositionChanges({
      serpDepth: 20,
      positionThreshold: 3,
      previous: [
        {
          trackingKeywordId: "kw1",
          keyword: "seo tool",
          device: "desktop",
          position: 5,
        },
      ],
      current: [
        {
          trackingKeywordId: "kw1",
          keyword: "seo tool",
          device: "desktop",
          position: 10,
        },
      ],
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]?.delta).toBe(5);
  });

  it("ignores small moves", () => {
    const changes = computeRankPositionChanges({
      serpDepth: 20,
      positionThreshold: 3,
      previous: [
        {
          trackingKeywordId: "kw1",
          keyword: "seo tool",
          device: "desktop",
          position: 5,
        },
      ],
      current: [
        {
          trackingKeywordId: "kw1",
          keyword: "seo tool",
          device: "desktop",
          position: 6,
        },
      ],
    });

    expect(changes).toHaveLength(0);
  });
});
