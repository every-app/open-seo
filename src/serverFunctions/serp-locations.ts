import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";

const searchSerpLocationsSchema = z.object({
  query: z.string().min(1).max(100),
  countryName: z.string().min(1).max(100),
});

export const searchSerpLocations = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(searchSerpLocationsSchema)
  .handler(async ({ data }) => {
    const all = await fetchSerpLocationsForCountry(data.countryName);
    const needle = data.query.trim().toLowerCase();
    return all
      .filter((loc) => loc.displayLabel.toLowerCase().includes(needle))
      .slice(0, 10);
  });
