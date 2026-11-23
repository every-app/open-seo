import { entries } from "remeda";
import { type DistanceUnit, formatDistance } from "@/shared/distance-unit";

// Grid size and spacing as the area a customer would recognize. The width is
// (gridSize - 1) × spacing, and each point is one paid search per keyword.
export const LOCAL_AREAS = {
  neighborhood: { name: "Neighborhood", gridSize: 3, spacingKm: 1 },
  town: { name: "Town", gridSize: 3, spacingKm: 2 },
  city: { name: "City", gridSize: 5, spacingKm: 2 },
  metro: { name: "Metro area", gridSize: 5, spacingKm: 5 },
} as const;
export type LocalArea = keyof typeof LOCAL_AREAS;

/** Picker items, e.g. "Town · 4 km wide · 9 points". */
export function localAreaItems(unit: DistanceUnit) {
  return entries(LOCAL_AREAS).map(([value, area]) => ({
    value,
    label: `${area.name} · ${formatDistance((area.gridSize - 1) * area.spacingKm, unit)} wide · ${area.gridSize * area.gridSize} points`,
  }));
}

/** The area a tracker's grid matches, or null for a grid saved before areas
 *  replaced free-form grid settings. */
export function localAreaOf(grid: { gridSize: number; spacingKm: number }) {
  return (
    entries(LOCAL_AREAS).find(
      ([, area]) =>
        area.gridSize === grid.gridSize && area.spacingKm === grid.spacingKm,
    )?.[0] ?? null
  );
}
