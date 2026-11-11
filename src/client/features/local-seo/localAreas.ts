import { entries } from "remeda";

// Grid size and spacing as the area a customer would recognize. The width is
// (gridSize - 1) × spacing, and each point is one paid search per keyword.
export const LOCAL_AREAS = {
  neighborhood: {
    label: "Neighborhood · 2 km wide · 9 points",
    gridSize: 3,
    spacingKm: 1,
  },
  town: { label: "Town · 4 km wide · 9 points", gridSize: 3, spacingKm: 2 },
  city: { label: "City · 8 km wide · 25 points", gridSize: 5, spacingKm: 2 },
  metro: {
    label: "Metro area · 20 km wide · 25 points",
    gridSize: 5,
    spacingKm: 5,
  },
} as const;
export type LocalArea = keyof typeof LOCAL_AREAS;

export const LOCAL_AREA_ITEMS = entries(LOCAL_AREAS).map(
  ([value, { label }]) => ({ value, label }),
);

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
