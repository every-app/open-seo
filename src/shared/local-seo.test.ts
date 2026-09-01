import { describe, expect, it } from "vitest";
import {
  estimateLocalGridCost,
  generateLocalGrid,
  toLocalGridSize,
} from "./local-seo";

describe("generateLocalGrid", () => {
  it("generates a stable north-to-south grid with an exact centre", () => {
    const points = generateLocalGrid({
      centerLatitude: 50.8179,
      centerLongitude: -0.3729,
      gridSize: 5,
      radiusMeters: 4_828,
    });

    expect(points).toHaveLength(25);
    expect(points[12]).toEqual({
      rowIndex: 2,
      columnIndex: 2,
      latitude: 50.8179,
      longitude: -0.3729,
    });
    expect(points[0].latitude).toBeGreaterThan(points[20].latitude);
    expect(points[0].longitude).toBeLessThan(points[4].longitude);
    expect(
      generateLocalGrid({
        centerLatitude: 50.8179,
        centerLongitude: -0.3729,
        gridSize: 5,
        radiusMeters: 4_828,
      }),
    ).toEqual(points);
  });

  it("accounts for longitude compression at UK latitudes", () => {
    const equator = generateLocalGrid({
      centerLatitude: 0,
      centerLongitude: 0,
      gridSize: 3,
      radiusMeters: 1_000,
    });
    const worthing = generateLocalGrid({
      centerLatitude: 50.8179,
      centerLongitude: 0,
      gridSize: 3,
      radiusMeters: 1_000,
    });

    expect(worthing[2].longitude).toBeGreaterThan(equator[2].longitude);
  });

  it("rejects unsupported grid sizes and unsafe radii", () => {
    expect(() => toLocalGridSize(4)).toThrow("Grid size");
    expect(() =>
      generateLocalGrid({
        centerLatitude: 50,
        centerLongitude: 0,
        gridSize: 3,
        radiusMeters: 50,
      }),
    ).toThrow("Radius");
  });
});

describe("estimateLocalGridCost", () => {
  it("counts every keyword-coordinate task at the queued Maps rate", () => {
    expect(
      estimateLocalGridCost({
        gridSize: 7,
        keywordCount: 10,
        searchDepth: 20,
      }),
    ).toEqual({
      taskCount: 490,
      costPerTaskUsd: 0.0006,
      rawCostUsd: 0.294,
      hostedCostUsd: 0.37632,
      hostedCredits: 377,
    });
    expect(
      estimateLocalGridCost({
        gridSize: 3,
        keywordCount: 1,
        searchDepth: 100,
      }).costPerTaskUsd,
    ).toBe(0.0006);
  });

  it("returns zero without keywords and rejects invalid depths", () => {
    expect(
      estimateLocalGridCost({
        gridSize: 3,
        keywordCount: 0,
        searchDepth: 10,
      }).rawCostUsd,
    ).toBe(0);
    expect(() =>
      estimateLocalGridCost({
        gridSize: 3,
        keywordCount: 1,
        searchDepth: 15,
      }),
    ).toThrow("Search depth");
  });
});
