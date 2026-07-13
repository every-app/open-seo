import { env } from "cloudflare:workers";
import { z } from "zod";
import { serpApi } from "@/server/lib/dataforseo/core";
import { assertOk } from "@/server/lib/dataforseo/envelope";
import { formatLocationLabel } from "@/shared/keyword-locations";

export interface SerpLocationResult {
  locationCode: number;
  locationName: string;
  locationType: string;
  displayLabel: string;
}

// Sub-country granularities users actually target. Deliberately excludes
// Postal Code (~32k extra rows for the US alone), State (national-ish), and
// long-tail types like Airport / University.
const INCLUDED_LOCATION_TYPES = new Set([
  "City",
  "County",
  "Municipality",
  "DMA Region",
  "Region",
]);

const locationItemSchema = z.object({
  location_code: z.number(),
  location_name: z.string(),
  location_type: z.string().nullable().optional(),
});

const cachedLocationsSchema = z.array(
  z.object({
    locationCode: z.number(),
    locationName: z.string(),
    locationType: z.string(),
    displayLabel: z.string(),
  }),
);

/** Google refreshes geotargets roughly quarterly; 30 days keeps us current. */
const KV_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Edge-cache hot reads so repeat searches skip the central KV store. */
const KV_HOT_READ_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(iso: string): string {
  return `serp-locations:${iso}`;
}

/**
 * Full sub-country location list for one country. `countryCode` is ISO
 * 3166-1 alpha-2 ("us", "gb") — the endpoint rejects country *names* with a
 * task-level Invalid Field error, which assertOk surfaces.
 *
 * The DataForSEO response is ~9.5MB for the US and the endpoint has no search
 * parameter, so the slimmed list (~1.5MB) is cached in KV (30d TTL, hot reads
 * edge-cached via cacheTtl); only a miss pays the origin fetch. The endpoint
 * is free (cost 0), so no billing envelope.
 */
export async function fetchSerpLocationsForCountry(
  countryCode: string,
): Promise<SerpLocationResult[]> {
  const iso = countryCode.toLowerCase();

  const cached = await env.KV.get(cacheKey(iso), {
    type: "json",
    cacheTtl: KV_HOT_READ_TTL_SECONDS,
  });
  const hit = cachedLocationsSchema.safeParse(cached);
  if (hit.success) return hit.data;

  return fillFromOrigin(iso);
}

// Coalesce concurrent cold fills within an isolate: the prewarm fired on
// selecting Local and the user's first debounced search otherwise both miss
// the cache and each fetch + parse the ~9.5MB origin payload. Entries are
// deleted on settle so the parsed array isn't retained past the fill (and a
// failed fill — e.g. the owning request got cancelled — isn't sticky).
const inflightFills = new Map<string, Promise<SerpLocationResult[]>>();

function fillFromOrigin(iso: string): Promise<SerpLocationResult[]> {
  const inflight = inflightFills.get(iso);
  if (inflight) return inflight;

  const fill = fetchFromDataforseo(iso)
    .then(async (fresh) => {
      await env.KV.put(cacheKey(iso), JSON.stringify(fresh), {
        expirationTtl: KV_TTL_SECONDS,
      });
      return fresh;
    })
    .finally(() => inflightFills.delete(iso));
  inflightFills.set(iso, fill);
  return fill;
}

async function fetchFromDataforseo(iso: string): Promise<SerpLocationResult[]> {
  const response = await serpApi().googleLocationsCountry(iso);
  const task = assertOk(response);
  return (task.result ?? [])
    .map((item) => locationItemSchema.safeParse(item))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .filter((item) => INCLUDED_LOCATION_TYPES.has(item.location_type ?? ""))
    .map((item) => ({
      locationCode: item.location_code,
      locationName: item.location_name,
      displayLabel: formatLocationLabel(item.location_name),
      locationType: item.location_type ?? "",
    }));
}
