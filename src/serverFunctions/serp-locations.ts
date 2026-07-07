import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";

/** ISO 3166-1 alpha-2, e.g. "us" — DataForSEO rejects country names. */
const countryCodeField = z.string().regex(/^[a-z]{2}$/i);

const searchSerpLocationsSchema = z.object({
  query: z.string().min(1).max(100),
  countryCode: countryCodeField,
});

export const searchSerpLocations = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(searchSerpLocationsSchema)
  .handler(async ({ data }) => {
    const all = await fetchSerpLocationsForCountry(data.countryCode);
    const needle = data.query.trim().toLowerCase();
    return all
      .filter((loc) => loc.displayLabel.toLowerCase().includes(needle))
      .slice(0, 10);
  });

/**
 * Warm the per-country location cache so the first real search is fast.
 * Fired when the user switches to Local targeting; the first search per
 * country otherwise pays the full ~9.5MB DataForSEO fetch (~3s).
 */
export const prewarmSerpLocations = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ countryCode: countryCodeField }))
  .handler(async ({ data }) => {
    await fetchSerpLocationsForCountry(data.countryCode);
    return { warmed: true };
  });
