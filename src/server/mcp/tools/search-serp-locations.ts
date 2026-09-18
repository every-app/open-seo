import { z } from "zod";
import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { rankSerpLocations } from "@/shared/serp-location-search";

const inputSchema = {
  query: z
    .string()
    .min(1)
    .max(100)
    .describe('Place name, e.g. "Catonsville" or "Portland OR".'),
  countryCode: z
    .string()
    .regex(/^[a-zA-Z]{2}$/)
    .describe('Two-letter ISO country code, e.g. "us".'),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const searchSerpLocationsTool = {
  name: "search_serp_locations",
  config: {
    title: "Search SERP locations",
    description:
      "Find the exact DataForSEO location name for local rank tracking. Returns up to 10 matches; pass the chosen `locationName` verbatim to create_rank_tracker. Uses no credits.",
    inputSchema,
    outputSchema: {
      locations: z.array(
        z.object({
          locationName: z.string(),
          locationCode: z.number(),
          locationType: z.string(),
        }),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: Args) => {
    const all = await fetchSerpLocationsForCountry(args.countryCode);
    const locations = rankSerpLocations(args.query, all, args.countryCode).map(
      (location) => ({
        locationName: location.locationName,
        locationCode: location.locationCode,
        locationType: location.locationType,
      }),
    );

    const text =
      locations.length === 0
        ? `No Google locations match "${args.query}" in ${args.countryCode}. Try the city name alone.`
        : locations
            .map(
              (location) =>
                `${location.locationName}  (${location.locationType}, ${location.locationCode})`,
            )
            .join("\n");

    return mcpResponse({ text, structuredContent: { locations } });
  },
};
