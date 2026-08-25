import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { readPath } from "@/server/mcp/table";

// Input schemas and coordinate formatting for the local-SEO tools. The
// coordinate formatters are also used by the DataForSEO research tools; the
// identifier helpers are used only by local-seo-tools.ts but live here to keep
// that (already max-lines-disabled) module from growing further.

// DataForSEO's Google business_data endpoints take the coordinate radius in
// meters (clamped to 200-199,999), while business_listings/search takes
// kilometers. Everything here speaks kilometers and converts at the edge.
const BUSINESS_DATA_MIN_RADIUS_M = 200;
const BUSINESS_DATA_MAX_RADIUS_M = 199999;
const BUSINESS_DATA_DEFAULT_RADIUS_KM = 10;

export function formatCoordinate(value: number): string {
  return Number(value.toFixed(7)).toString();
}

export const businessDataNearSchema = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe("Latitude of the search center."),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the search center."),
    radiusKm: z
      .number()
      .min(0.2)
      .max(199)
      .optional()
      .describe(
        "Search radius around the center, in kilometers (0.2-199). Defaults to 10.",
      ),
  })
  .describe(
    "Coordinate to search from. Use it when the business name is ambiguous; otherwise locationCode is enough.",
  );

/** "lat,lng,radius" with the radius in meters, as Google business_data wants. */
export function formatBusinessDataCoordinate(near: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
}): string {
  const radius = Math.min(
    BUSINESS_DATA_MAX_RADIUS_M,
    Math.max(
      BUSINESS_DATA_MIN_RADIUS_M,
      Math.round((near.radiusKm ?? BUSINESS_DATA_DEFAULT_RADIUS_KM) * 1000),
    ),
  );
  return `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)},${radius}`;
}

export const businessIdentifierInputSchema = {
  businessName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Business name as it appears on Google. Supply exactly one of businessName, cid, or placeId.",
    ),
  cid: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe(
      "Google-defined business CID (from get_local_serp_results rows). Most precise identifier.",
    ),
  placeId: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe("Google Maps place_id (from get_local_serp_results rows)."),
} as const;

type ResolvedBusinessIdentifier = {
  keyword?: string;
  cid?: string;
  placeId?: string;
};

/** Validates the exactly-one-identifier rule the business_data endpoints need. */
export function resolveBusinessIdentifier(args: {
  businessName?: string;
  cid?: string;
  placeId?: string;
}): ResolvedBusinessIdentifier {
  const supplied = [args.businessName, args.cid, args.placeId].filter(
    (value) => value != null,
  );
  if (supplied.length !== 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Provide exactly one business identifier: businessName, cid, or placeId.",
    );
  }
  return { keyword: args.businessName, cid: args.cid, placeId: args.placeId };
}

/**
 * my_business_info and my_business_updates accept only `keyword`, which carries
 * the other identifiers through DataForSEO's documented `cid:` / `place_id:`
 * prefixes.
 */
export function businessIdentifierKeyword(
  identifier: ResolvedBusinessIdentifier,
): string {
  if (identifier.cid != null) return `cid:${identifier.cid}`;
  if (identifier.placeId != null) return `place_id:${identifier.placeId}`;
  return identifier.keyword ?? "";
}

/**
 * Allowlist projection for provider rows. Full DataForSEO rows carry image
 * URLs, xpaths, and tracking blobs that overflow MCP clients' tool-result
 * budgets; each tool declares the fields its consumers actually read.
 */
export function pickRowFields(
  row: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};
  for (const field of fields) {
    const value = readPath(row, field);
    if (value !== undefined) trimmed[field] = value;
  }
  return trimmed;
}

/** "lat,lng" with an optional trailing map zoom, as the Maps SERP wants. */
export function formatLocalSerpCoordinate(near: {
  latitude: number;
  longitude: number;
  zoom?: number;
}): string {
  const coordinate = `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)}`;
  return near.zoom == null ? coordinate : `${coordinate},${near.zoom}z`;
}
