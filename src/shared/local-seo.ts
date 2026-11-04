export enum LocalScanStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Partial = "partial",
  Failed = "failed",
}

export enum LocalPointStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}

export const LOCAL_RANK_DEPTH = 20;

export function isLocalScanActive(status: LocalScanStatus) {
  return (
    status === LocalScanStatus.Queued || status === LocalScanStatus.Running
  );
}

export type LocalGridPoint = {
  row: number;
  col: number;
  latitude: number;
  longitude: number;
};

/**
 * Keep the same viewport at every point, wide enough for the grid spacing.
 *
 * Without an explicit zoom DataForSEO infers one per coordinate, which yields
 * "No Search Results" for some points and makes ranks incomparable across the
 * grid. A fixed zoom fails the other way: a mobile viewport at zoom 14 spans
 * only ~±1.5 km east-west at mid latitudes, so a business one 2-3 km grid step
 * to the side falls outside the viewport and reads as "not ranked". A world
 * tile is 40075·cos(lat)/2^z km wide and a portrait viewport ~1.5 tiles, so
 * the largest zoom whose viewport still spans ~1.25× the spacing is
 * log2(24045·cos(lat)/spacing).
 */
export function localGridZoom(spacingKm: number, latitude: number) {
  const cosine = Math.max(Math.abs(Math.cos((latitude * Math.PI) / 180)), 0.01);
  return Math.min(
    18,
    Math.max(4, Math.floor(Math.log2((24045 * cosine) / spacingKm))),
  );
}

/** The grid as a customer reads it, e.g. "9 points across 4 km". */
export function localAreaLabel(grid: { gridSize: number; spacingKm: number }) {
  return `${grid.gridSize * grid.gridSize} points across ${(grid.gridSize - 1) * grid.spacingKm} km`;
}

/** Row zero is the northern edge; points are in row-major order. */
export function buildLocalGrid(
  center: { latitude: number; longitude: number },
  gridSize: number,
  spacingKm: number,
): LocalGridPoint[] {
  const middle = (gridSize - 1) / 2;
  const latitudeStep = spacingKm / 110.574;
  const longitudeStep =
    spacingKm /
    (111.32 *
      Math.max(Math.abs(Math.cos((center.latitude * Math.PI) / 180)), 0.01));
  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    return {
      row,
      col,
      latitude: Number(
        (center.latitude + (middle - row) * latitudeStep).toFixed(7),
      ),
      longitude: Number(
        (center.longitude + (col - middle) * longitudeStep).toFixed(7),
      ),
    };
  });
}

type RankedPoint = {
  status: LocalPointStatus;
  rank: number | null;
  resultsCount: number | null;
};

export function localPointLabel(point: RankedPoint) {
  if (point.status === LocalPointStatus.Pending) return "Pending";
  if (point.status === LocalPointStatus.Failed) return "Search failed";
  if (point.rank != null) return `#${point.rank}`;
  return (point.resultsCount ?? 0) >= LOCAL_RANK_DEPTH
    ? "Not in returned top 20"
    : `Not found · ${point.resultsCount ?? 0} listings returned`;
}
