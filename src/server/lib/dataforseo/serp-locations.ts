import { z } from "zod";
import { serpApi } from "@/server/lib/dataforseo/core";
import { assertOk } from "@/server/lib/dataforseo/envelope";
import { getCached, setCached } from "@/server/lib/r2-cache";
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
const R2_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Per-colo hot layer in front of R2. */
const COLO_CACHE_TTL_SECONDS = 24 * 60 * 60;

function coloCacheUrl(countryCode: string): string {
  // Synthetic key for the colo cache; never fetched over the network.
  return `https://serp-locations.internal/${countryCode}`;
}

// Named cache instead of caches.default: identical per-colo semantics, and
// the DOM lib's CacheStorage type (this repo compiles client+server under
// one tsconfig) has no `.default`.
function coloCache(): Promise<Cache> {
  return caches.open("serp-locations");
}

/**
 * Full sub-country location list for one country. `countryCode` is ISO
 * 3166-1 alpha-2 ("us", "gb") — the endpoint rejects country *names* with a
 * task-level Invalid Field error, which assertOk surfaces.
 *
 * The DataForSEO response is ~9.5MB for the US and the endpoint has no search
 * parameter, so the slimmed list (~1.5MB) is cached: per-colo via
 * caches.default, then R2 (30d soft TTL), and only on a miss of both do we
 * pay the origin fetch. The endpoint is free (cost 0), so no billing
 * envelope.
 */
export async function fetchSerpLocationsForCountry(
  countryCode: string,
): Promise<SerpLocationResult[]> {
  const iso = countryCode.toLowerCase();

  const coloHit = await (await coloCache()).match(coloCacheUrl(iso));
  if (coloHit) {
    const parsed = cachedLocationsSchema.safeParse(await coloHit.json());
    if (parsed.success) return parsed.data;
  }

  const cacheKey = `serp-locations:${iso}`;
  const r2Hit = cachedLocationsSchema.safeParse(await getCached(cacheKey));
  const locations = r2Hit.success ? r2Hit.data : await fillFromOrigin(iso);

  await (
    await coloCache()
  ).put(
    coloCacheUrl(iso),
    new Response(JSON.stringify(locations), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${COLO_CACHE_TTL_SECONDS}`,
      },
    }),
  );

  return locations;
}

// Coalesce concurrent cold fills within an isolate: the prewarm fired on
// selecting Local and the user's first debounced search otherwise both miss
// the caches and each fetch + parse the ~9.5MB origin payload. Entries are
// deleted on settle so the parsed array isn't retained past the fill (and a
// failed fill — e.g. the owning request got cancelled — isn't sticky).
const inflightFills = new Map<string, Promise<SerpLocationResult[]>>();

function fillFromOrigin(iso: string): Promise<SerpLocationResult[]> {
  const inflight = inflightFills.get(iso);
  if (inflight) return inflight;

  const fill = fetchFromDataforseo(iso)
    .then(async (fresh) => {
      await setCached(`serp-locations:${iso}`, fresh, R2_TTL_SECONDS);
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
