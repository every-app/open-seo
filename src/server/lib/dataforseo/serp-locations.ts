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

/**
 * Full sub-country location list for one country. `countryCode` is ISO
 * 3166-1 alpha-2 ("us", "gb") — the endpoint rejects country *names* with a
 * task-level Invalid Field error, which assertOk surfaces. Free endpoint
 * (cost 0), so no billing envelope.
 */
export async function fetchSerpLocationsForCountry(
  countryCode: string,
): Promise<SerpLocationResult[]> {
  const response = await serpApi().googleLocationsCountry(
    countryCode.toLowerCase(),
  );
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
