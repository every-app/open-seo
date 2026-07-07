import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";

const searchSerpLocationsSchema = z.object({
  query: z.string().min(1).max(100),
  /** ISO 3166-1 alpha-2, e.g. "us" — DataForSEO rejects country names. */
  countryCode: z.string().regex(/^[a-z]{2}$/i),
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
