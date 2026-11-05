import { describe, expect, it } from "vitest";
import {
  computeRankPositionChanges,
  filterRankChangesByDirection,
  rankDistance,
  rankMovementDirection,
  formatRankTrendLabel,
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

  it("labels improved vs worsened movement", () => {
    const improved = computeRankPositionChanges({
      serpDepth: 100,
      positionThreshold: 1,
      previous: [
        {
          trackingKeywordId: "kw1",
          keyword: "a",
          device: "desktop",
          position: 79,
        },
      ],
      current: [
        {
          trackingKeywordId: "kw1",
          keyword: "a",
          device: "desktop",
          position: 16,
        },
      ],
    })[0]!;
    expect(rankMovementDirection(improved, 100)).toBe("improved");
    expect(formatRankTrendLabel(improved, 100).arrow).toBe("▲");

    const worsened = computeRankPositionChanges({
      serpDepth: 100,
      positionThreshold: 1,
      previous: [
        {
          trackingKeywordId: "kw2",
          keyword: "b",
          device: "mobile",
          position: 2,
        },
      ],
      current: [
        {
          trackingKeywordId: "kw2",
          keyword: "b",
          device: "mobile",
          position: 43,
        },
      ],
    })[0]!;
    expect(rankMovementDirection(worsened, 100)).toBe("worsened");
    expect(formatRankTrendLabel(worsened, 100).arrow).toBe("▼");
  });

  it("filters changes by improved or worsened direction", () => {
    const changes = computeRankPositionChanges({
      serpDepth: 100,
      positionThreshold: 1,
      previous: [
        {
          trackingKeywordId: "kw1",
          keyword: "up",
          device: "desktop",
          position: 20,
        },
        {
          trackingKeywordId: "kw2",
          keyword: "down",
          device: "desktop",
          position: 5,
        },
      ],
      current: [
        {
          trackingKeywordId: "kw1",
          keyword: "up",
          device: "desktop",
          position: 10,
        },
        {
          trackingKeywordId: "kw2",
          keyword: "down",
          device: "desktop",
          position: 15,
        },
      ],
    });
    expect(changes).toHaveLength(2);

    const improvedOnly = filterRankChangesByDirection({
      changes,
      serpDepth: 100,
      direction: "improved",
    });
    expect(improvedOnly.map((c) => c.keyword)).toEqual(["up"]);

    const worsenedOnly = filterRankChangesByDirection({
      changes,
      serpDepth: 100,
      direction: "worsened",
    });
    expect(worsenedOnly.map((c) => c.keyword)).toEqual(["down"]);
  });
});
