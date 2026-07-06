import { getRequiredEnvValue } from "@/server/lib/runtime-env";

export interface SerpLocationResult {
  locationCode: number;
  locationName: string;
  locationType: string;
  displayLabel: string;
}

const INCLUDED_LOCATION_TYPES = new Set([
  "City",
  "County",
  "Municipality",
  "DMA Region",
  "Region",
]);

export async function fetchSerpLocationsForCountry(
  countryName: string,
): Promise<SerpLocationResult[]> {
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  const url = `https://api.dataforseo.com/v3/serp/google/locations/${encodeURIComponent(countryName)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`DataForSEO locations fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    tasks?: Array<{
      result?: Array<{
        location_code?: number;
        location_name?: string;
        location_type?: string;
      }>;
    }>;
  };
  const results = body.tasks?.[0]?.result ?? [];
  return results
    .filter(
      (r) =>
        r.location_name &&
        r.location_code &&
        INCLUDED_LOCATION_TYPES.has(r.location_type ?? ""),
    )
    .map((r) => ({
      locationCode: r.location_code!,
      locationName: r.location_name!,
      displayLabel: r.location_name!.split(",").join(", "),
      locationType: r.location_type ?? "",
    }));
}
