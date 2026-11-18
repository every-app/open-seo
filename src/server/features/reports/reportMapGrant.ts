import { Parser } from "htmlparser2";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  readMapGrant,
  REPORT_MAP_HEIGHT,
  REPORT_MAP_MAX_ZOOM,
  REPORT_MAP_PADDING,
  type MapArea,
  type MapGrantScope,
} from "@/shared/report-map";

// Signed grants for the rank-grid widget's map (see src/shared/report-map.ts).
// The grant is signed with the Maps key itself, so there is no extra secret to
// configure, and a deployment without Google Maps issues no grants: its
// reports keep the static grid drawing.

// Long enough for a tab left open over a day, short enough that a grant
// copied out of a report stops working.
const GRANT_TTL_SECONDS = 24 * 60 * 60;

// Around the grid, room to pan: one and a half times the grid's size on every
// side, and never less than ~3 km. The widget keeps its view inside this area.
const PAD_GRID_SPANS = 1.5;
const MIN_PAD_DEGREES = 0.03;

// How far a reader can zoom from the fitted view: out far enough to place the
// grid in its town, in close enough to read street names around a point.
const ZOOM_OUT_LEVELS = 2;
const ZOOM_IN_LEVELS = 2;

// Zoomed out, the view can be bigger than the area, so tiles within this many
// tiles of it are served too: half the widest view is about two tiles, with
// room to spare. The widget keeps its view inside the area wherever the view
// fits in it, so only zoomed-out views ever reach into this margin.
const MARGIN_TILES = 4;

// The space the widget fits the grid into, from a phone to a wide report
// column. The height is fixed by the widget's CSS.
const MIN_FIT_PX = 160;
const MAX_FIT_WIDTH_PX = 1080;
const MAX_FIT_HEIGHT_PX = REPORT_MAP_HEIGHT - 2 * REPORT_MAP_PADDING;

const widgetPointsSchema = z.object({
  keywords: z.array(
    z.object({
      points: z.array(
        z.object({
          lat: z.number().min(-85).max(85),
          lng: z.number().min(-180).max(180),
        }),
      ),
    }),
  ),
});

// The JSON data block inside each rank-grid figure. A streaming parse, not a
// regex: this runs on every view of a stored, user-written document, and a
// backtracking pattern can be made to burn seconds of CPU per request.
function widgetBlocks(html: string) {
  const blocks: string[] = [];
  let figureDepth = 0;
  let inBlock = false;
  let text = "";
  const parser = new Parser({
    onopentag(name, attributes) {
      if (
        name === "figure" &&
        (figureDepth > 0 || attributes["data-widget"] === "rank-grid")
      )
        figureDepth++;
      if (
        figureDepth > 0 &&
        name === "script" &&
        attributes.type === "application/json"
      ) {
        inBlock = true;
        text = "";
      }
    },
    ontext(chunk) {
      if (inBlock) text += chunk;
    },
    onclosetag(name) {
      if (name === "script" && inBlock) {
        inBlock = false;
        blocks.push(text);
      }
      if (name === "figure" && figureDepth > 0) figureDepth--;
    },
  });
  parser.end(html);
  return blocks;
}

// The points of each rank grid in the report, one list per figure.
function gridsInReport(html: string) {
  const grids: Array<Array<{ lat: number; lng: number }>> = [];
  for (const block of widgetBlocks(html)) {
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }
    const parsed = widgetPointsSchema.safeParse(data);
    if (!parsed.success) continue;
    const points = parsed.data.keywords.flatMap((keyword) => keyword.points);
    if (points.length > 0) grids.push(points);
  }
  return grids;
}

function mapGrantScope(
  points: Array<{ lat: number; lng: number }>,
): MapGrantScope {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const padLat = Math.max((north - south) * PAD_GRID_SPANS, MIN_PAD_DEGREES);
  const padLng = Math.max((east - west) * PAD_GRID_SPANS, MIN_PAD_DEGREES);
  const fitted = fittedZoomRange({ south, west, north, east });
  return {
    area: {
      south: south - padLat,
      west: west - padLng,
      north: north + padLat,
      east: east + padLng,
    },
    minZoom: Math.max(0, fitted.minZoom - ZOOM_OUT_LEVELS),
    maxZoom: Math.min(REPORT_MAP_MAX_ZOOM, fitted.maxZoom + ZOOM_IN_LEVELS),
  };
}

// Web-mercator y of a latitude, 0 at the top of the world and 1 at the bottom.
function mercatorY(lat: number) {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/**
 * The tile zooms the widget can land on when it fits the grid into its view
 * (Leaflet's fitBounds), across every view size it can have.
 */
function fittedZoomRange(grid: MapArea) {
  // The grid's size in pixels at zoom 0, where the world is 256 across.
  const width = ((grid.east - grid.west) / 360) * 256;
  const height = (mercatorY(grid.south) - mercatorY(grid.north)) * 256;
  const fit = (w: number, h: number) =>
    Math.log2(Math.min(w / width, h / height));
  const clamp = (zoom: number) =>
    Math.min(REPORT_MAP_MAX_ZOOM, Math.max(0, zoom));
  return {
    minZoom: clamp(Math.floor(fit(MIN_FIT_PX, MIN_FIT_PX))),
    maxZoom: clamp(Math.ceil(fit(MAX_FIT_WIDTH_PX, MAX_FIT_HEIGHT_PX))),
  };
}

function hmacKey(apiKey: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`openseo:report-map:${apiKey}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, apiKey: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(apiKey),
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mapsKey() {
  return (await getOptionalEnvValue("GOOGLE_MAPS_API_KEY"))?.trim() || null;
}

/**
 * One grant per distinct rank grid in the report, empty for none. Each grid
 * gets its own: a report covering several locations would otherwise share one
 * grant sized to all of them, and its zooms would hold every map far out.
 */
export async function createReportMapGrants(html: string) {
  const apiKey = await mapsKey();
  if (!apiKey) return [];
  const expiresAt = Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS;
  const payloads = new Set(
    gridsInReport(html).map((points) => {
      const scope = mapGrantScope(points);
      return [
        scope.area.south.toFixed(5),
        scope.area.west.toFixed(5),
        scope.area.north.toFixed(5),
        scope.area.east.toFixed(5),
        scope.minZoom,
        scope.maxZoom,
        expiresAt,
      ].join("~");
    }),
  );
  return Promise.all(
    [...payloads].map(
      async (payload) => `${payload}~${await sign(payload, apiKey)}`,
    ),
  );
}

/** What a grant covers, or null when it is forged or expired. */
export async function verifyReportMapGrant(
  grant: string,
): Promise<MapGrantScope | null> {
  const parsed = readMapGrant(grant);
  if (!parsed || parsed.expiresAt * 1000 < Date.now()) return null;
  const apiKey = await mapsKey();
  if (!apiKey) return null;
  if (!/^[0-9a-f]{64}$/.test(parsed.signature)) return null;
  const signature = Uint8Array.from(
    parsed.signature.match(/../g) ?? [],
    (hex) => parseInt(hex, 16),
  );
  // verify() compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(apiKey),
    signature,
    new TextEncoder().encode(parsed.signed),
  );
  if (!valid) return null;
  return {
    area: parsed.area,
    minZoom: parsed.minZoom,
    maxZoom: parsed.maxZoom,
  };
}

function tileLatitude(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Whether a grant covers a web-mercator tile: one of its zooms, in its area or
 * within MARGIN_TILES of it.
 */
export function grantCoversTile(
  tile: { z: number; x: number; y: number },
  { area, minZoom, maxZoom }: MapGrantScope,
) {
  if (tile.z < minZoom || tile.z > maxZoom) return false;
  const west = ((tile.x - MARGIN_TILES) / 2 ** tile.z) * 360 - 180;
  const east = ((tile.x + 1 + MARGIN_TILES) / 2 ** tile.z) * 360 - 180;
  const north = tileLatitude(tile.y - MARGIN_TILES, tile.z);
  const south = tileLatitude(tile.y + 1 + MARGIN_TILES, tile.z);
  return (
    west < area.east &&
    east > area.west &&
    south < area.north &&
    north > area.south
  );
}
