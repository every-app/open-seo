// The map behind the rank-grid report widget: Google Maps tiles, proxied
// through /report-map so no key reaches a reader. A report is sandboxed and
// may be read by anyone holding a share link, so the proxy cannot ask who is
// reading. Instead the document response carries a signed grant per rank grid,
// naming the area around that grid and the few zoom levels either side of a
// fitted view of it, and the proxy serves those tiles only. Shared by the
// server, which signs and checks grants, and by the widget, which keeps its
// zoom and panning inside the grant.

/** The closest zoom the map offers: street level, not building level. */
export const REPORT_MAP_MAX_ZOOM = 18;

/** The widget map's CSS height; its width follows the report column. */
export const REPORT_MAP_HEIGHT = 480;

/** Pixels the widget keeps between the grid and each edge of its view. */
export const REPORT_MAP_PADDING = 60;

export type MapArea = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type MapGrantScope = {
  area: MapArea;
  minZoom: number;
  maxZoom: number;
};

/**
 * A grant is `south~west~north~east~minZoom~maxZoom~expiresAt~signature`:
 * path-safe, so it goes straight into tile URLs. The signature covers
 * everything before it.
 */
export function readMapGrant(grant: string) {
  const parts = grant.split("~");
  if (parts.length !== 8) return null;
  const numbers = parts.slice(0, 7).map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  const [south, west, north, east, minZoom, maxZoom, expiresAt] = numbers;
  return {
    area: { south, west, north, east },
    minZoom,
    maxZoom,
    expiresAt,
    signed: parts.slice(0, 7).join("~"),
    signature: parts[7],
  };
}
