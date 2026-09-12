import { z } from "zod";
import { sort } from "remeda";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const countryDistributionSchema = z.object({
  countryIsoCode: z.string(),
  searchVolume: z.number().int().nonnegative(),
  percentage: z.number().nonnegative().max(100),
});

const inputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(3).max(255))
    .min(1)
    .max(1000)
    .describe(
      "1-1000 keywords to measure against the worldwide clickstream search-volume dataset. Unlike location-based keyword tools, this does not use the project's market or language.",
    ),
  maxCountries: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Maximum number of highest-volume countries to include per keyword. Defaults to 20; the full provider distribution is counted but bounded in the MCP response.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

type GlobalSearchVolumeOutputRow = {
  keyword: string;
  searchVolume: number;
  countryDistribution: z.infer<typeof countryDistributionSchema>[];
  countryDistributionTotal: number;
  countryDistributionTruncated: boolean;
};

const GLOBAL_VOLUME_COLUMNS: McpTableColumn<GlobalSearchVolumeOutputRow>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "global volume", value: (row) => row.searchVolume },
  {
    header: "top countries",
    value: (row) =>
      row.countryDistribution.length === 0
        ? "—"
        : row.countryDistribution
            .map(
              (country) =>
                `${country.countryIsoCode} ${country.searchVolume} (${country.percentage.toFixed(2)}%)`,
            )
            .join(", "),
  },
];

export const globalSearchVolumeTool = {
  name: "global_search_volume",
  config: {
    title: "Worldwide search volume",
    description:
      "Measure approximate worldwide average monthly search volume for 1-1000 keywords using DataForSEO's Clickstream Global Search Volume endpoint. Returns the global volume plus a bounded top-country distribution. This is a global popularity signal, not a count of trail visitors. Charges credits per provider request.",
    inputSchema,
    outputSchema: {
      scope: z.literal("worldwide"),
      source: z.literal("dataforseo_clickstream_global_search_volume"),
      rows: z.array(
        z
          .object({
            keyword: z.string(),
            searchVolume: z.number().int().nonnegative(),
            countryDistribution: z.array(countryDistributionSchema),
            countryDistributionTotal: z.number().int().nonnegative(),
            countryDistributionTruncated: z.boolean(),
          })
          .passthrough(),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const client = createDataforseoClient(context.billing);
    const providerRows = await client.keywords.globalSearchVolume({
      keywords: args.keywords,
      creditFeature: "keyword_research",
    });
    const maxCountries = args.maxCountries ?? 20;
    const rows = providerRows.map((row) => {
      const sortedCountries = sort(
        row.countryDistribution,
        (left, right) => right.searchVolume - left.searchVolume,
      );
      const countryDistribution = sortedCountries.slice(0, maxCountries);
      return {
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        countryDistribution,
        countryDistributionTotal: sortedCountries.length,
        countryDistributionTruncated: sortedCountries.length > maxCountries,
      };
    });

    return mcpResponse({
      text: `Worldwide clickstream search volume (approximate average monthly searches)\n\n${formatMcpTable(rows, GLOBAL_VOLUME_COLUMNS)}\n\nReturned ${rows.length} keyword rows. Country distributions are limited to the top ${maxCountries} countries per keyword; global volume is not trail visitation data.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: {
        scope: "worldwide",
        source: "dataforseo_clickstream_global_search_volume",
        rows,
      },
    });
  }),
};
