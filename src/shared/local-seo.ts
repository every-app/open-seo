import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  applyBillingMarkupUsd,
  roundUsdForBilling,
} from "./billing";

export const LOCAL_GRID_SIZES = [3, 5, 7] as const;
type LocalGridSize = (typeof LOCAL_GRID_SIZES)[number];

const EARTH_RADIUS_METERS = 6_371_008.8;
const QUEUED_MAPS_TASK_USD = 0.0006;

interface LocalGridPoint {
  rowIndex: number;
  columnIndex: number;
  latitude: number;
  longitude: number;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

export function toLocalGridSize(value: number): LocalGridSize {
  if (value === 3 || value === 5 || value === 7) return value;
  throw new RangeError(
    `Grid size must be one of ${LOCAL_GRID_SIZES.join(", ")}`,
  );
}

function assertGridInput(input: {
  centerLatitude: number;
  centerLongitude: number;
  gridSize: number;
  radiusMeters: number;
}) {
  if (
    !Number.isFinite(input.centerLatitude) ||
    input.centerLatitude < -85 ||
    input.centerLatitude > 85
  ) {
    throw new RangeError("Center latitude must be between -85 and 85");
  }
  if (
    !Number.isFinite(input.centerLongitude) ||
    input.centerLongitude < -180 ||
    input.centerLongitude > 180
  ) {
    throw new RangeError("Center longitude must be between -180 and 180");
  }
  toLocalGridSize(input.gridSize);
  if (
    !Number.isFinite(input.radiusMeters) ||
    input.radiusMeters < 100 ||
    input.radiusMeters > 100_000
  ) {
    throw new RangeError("Radius must be between 100 and 100000 metres");
  }
}

/**
 * Build a north-to-south, west-to-east square grid. Radius is the distance
 * from the centre to each outer edge, so adjacent cells remain comparable
 * when a config is regenerated. The centre cell is copied verbatim.
 */
export function generateLocalGrid(input: {
  centerLatitude: number;
  centerLongitude: number;
  gridSize: LocalGridSize;
  radiusMeters: number;
}): LocalGridPoint[] {
  assertGridInput(input);

  const half = (input.gridSize - 1) / 2;
  const centerLatitudeRadians = degreesToRadians(input.centerLatitude);
  const points: LocalGridPoint[] = [];

  for (let rowIndex = 0; rowIndex < input.gridSize; rowIndex += 1) {
    const northMeters = ((half - rowIndex) / half) * input.radiusMeters;
    for (let columnIndex = 0; columnIndex < input.gridSize; columnIndex += 1) {
      if (rowIndex === half && columnIndex === half) {
        points.push({
          rowIndex,
          columnIndex,
          latitude: input.centerLatitude,
          longitude: input.centerLongitude,
        });
        continue;
      }

      const eastMeters = ((columnIndex - half) / half) * input.radiusMeters;
      const latitude =
        input.centerLatitude +
        radiansToDegrees(northMeters / EARTH_RADIUS_METERS);
      const longitude =
        input.centerLongitude +
        radiansToDegrees(
          eastMeters / (EARTH_RADIUS_METERS * Math.cos(centerLatitudeRadians)),
        );

      points.push({
        rowIndex,
        columnIndex,
        latitude,
        longitude,
      });
    }
  }

  return points;
}

export function estimateLocalGridCost(input: {
  gridSize: LocalGridSize;
  keywordCount: number;
  searchDepth: number;
}) {
  if (!Number.isInteger(input.keywordCount) || input.keywordCount < 0) {
    throw new RangeError("Keyword count must be a non-negative integer");
  }
  if (
    !Number.isInteger(input.searchDepth) ||
    input.searchDepth < 10 ||
    input.searchDepth > 100 ||
    input.searchDepth % 10 !== 0
  ) {
    throw new RangeError(
      "Search depth must be a multiple of 10 from 10 to 100",
    );
  }
  if (!LOCAL_GRID_SIZES.includes(input.gridSize)) {
    throw new RangeError(
      `Grid size must be one of ${LOCAL_GRID_SIZES.join(", ")}`,
    );
  }

  const taskCount = input.gridSize ** 2 * input.keywordCount;
  // Google Maps bills one queued SERP for up to 100 desktop results.
  const costPerTaskUsd = QUEUED_MAPS_TASK_USD;
  const rawCostUsd = roundUsdForBilling(taskCount * costPerTaskUsd);
  const hostedCostUsd = applyBillingMarkupUsd(rawCostUsd);

  return {
    taskCount,
    costPerTaskUsd,
    rawCostUsd,
    hostedCostUsd,
    hostedCredits: Math.ceil(hostedCostUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD),
  };
}
