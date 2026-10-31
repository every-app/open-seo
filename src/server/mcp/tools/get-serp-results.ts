import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import {
  createDataforseoClient,
  SERP_ANALYSIS_DEPTH,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { serpSchema, serpItemSchema } from "@/shared/mcp-contracts";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import { assertLocalResearchLocation } from "@/server/features/keywords/services/research/local-volume";
import { toolErrorMessage } from "@/server/mcp/tool-error-message";
import {
  formatMcpTable,
  sectionTableBudget,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

// A repeat within this window is answered from the saved rows, uncharged, so a
// caller that lost a response can call again instead of paying twice.
const SERP_RESULTS_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpItem = z.infer<typeof serpItemSchema>;

// `type` is load-bearing: the advanced SERP is a mixed list, so without it a
// featured_snippet or people_also_ask row (which has no domain/title/url) reads
// as an unlabeled organic position. Snippets are trimmed so the prose column
// can't dominate the table — the full text stays in structuredContent.
const SERP_ITEM_COLUMNS: McpTableColumn<SerpItem>[] = [
  { header: "rank", value: (item) => item.rank },
  { header: "type", value: (item) => item.type },
  { header: "organic rank", value: (item) => item.organicRank },
  { header: "domain", value: (item) => item.domain },
  { header: "title", value: (item) => item.title },
  { header: "url", value: (item) => item.url },
  {
    header: "description",
    value: (item) => item.description,
    format: truncatedCell(120),
  },
];

const querySchema = z.object({
  keyword: z.string().min(1).describe("Search query to fetch the SERP for."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  locationName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional city, county, or region inside the query's country, for a local SERP. Call search_serp_locations first and pass its locationName verbatim. Same price as a national SERP.",
    ),
  device: z
    .enum(["desktop", "mobile"])
    .optional()
    .describe(
      "Device to fetch the SERP for, default desktop. Use mobile to compare against a mobile rank tracker. Same price.",
    ),
});

const inputSchema = {
  projectId: projectIdSchema,
  queries: z
    .array(querySchema)
    .min(1)
    .max(10)
    .describe(
      "1-10 queries. Bulk-friendly — prefer this over multiple single-query calls.",
    ),
  depth: z
    .number()
    .int()
    .min(10)
    .max(100)
    .multipleOf(10)
    .optional()
    .describe(
      "How many SERP rows to crawl per keyword — a multiple of 10 from 10 to 100, default 20. Google has no offset, so a deeper crawl re-fetches the top too: each additional 10 adds ~2.5 credits per keyword. Only raise it when you need ranks past the top 20.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getSerpResultsTool = {
  name: "get_serp_results",
  config: {
    title: "Get Google SERP results",
    description:
      "Fetch live Google organic search results for 1-10 keywords. Use this to inspect who ranks for a query, verify competitors, compare SERPs across keywords, or gather source URLs before content planning. Returns the top `depth` result rows per keyword (default 20). `rank` counts every SERP element (ads, People Also Ask, ...); `organicRank` counts organic results only and matches rank tracker positions. Charges credits per keyword: ~5 each at the default depth 20, and each additional 10 of depth adds ~2.5. A keyword fetched in this project in the last 12 hours with the same market, device, and depth returns those rows again at no charge once the original call has finished, so if a response is lost, wait a minute and repeat the same call. Per-keyword errors don't fail the batch.",
    inputSchema,
    outputSchema: serpSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const client = createDataforseoClient(context.billing);
    const depth = args.depth ?? SERP_ANALYSIS_DEPTH;
    const lookups = await Promise.all(
      args.queries.map(async (q) => {
        try {
          const market = resolveMarket(q, context.project);
          const scope = {
            ...market,
            locationName: q.locationName,
            device: q.device ?? "desktop",
          };
          if (q.locationName) {
            await assertLocalResearchLocation(
              market.locationCode,
              q.locationName,
            );
          }
          const cacheKey = await buildCacheKey("mcp:serp-results", {
            organizationId: context.billing.organizationId,
            projectId: args.projectId,
            keyword: q.keyword,
            ...market,
            locationName: q.locationName,
            depth,
            // Omitted for desktop, explicit or default, so desktop keys match
            // rows cached before the device option existed.
            device: q.device === "mobile" ? "mobile" : undefined,
          });
          const cached = z
            .array(serpItemSchema)
            .safeParse(await getCached(cacheKey));
          const input = {
            keyword: q.keyword,
            ...market,
            locationName: q.locationName,
            depth,
            device: q.device,
          };
          return {
            ok: true as const,
            keyword: q.keyword,
            scope,
            cacheKey,
            input,
            cachedItems: cached.success ? cached.data : undefined,
          };
        } catch (error) {
          return { ok: false as const, keyword: q.keyword, error };
        }
      }),
    );

    // One batch for every uncached query: its credits settle once, after
    // all of them have answered (see client.serp.liveBatch).
    const misses = lookups.flatMap((lookup) =>
      lookup.ok && !lookup.cachedItems ? [lookup] : [],
    );
    // A batch that can't hold any credits rejects as a whole; report it on
    // each uncached query so cached ones still return.
    const fetched =
      misses.length > 0
        ? await client.serp
            .liveBatch(misses.map((miss) => miss.input))
            .catch((reason: unknown) =>
              misses.map(() => ({ status: "rejected" as const, reason })),
            )
        : [];

    const results = lookups.map((lookup) => {
      if (!lookup.ok) {
        return {
          keyword: lookup.keyword,
          ok: false as const,
          error: toolErrorMessage(lookup.error),
        };
      }
      if (lookup.cachedItems) {
        return {
          keyword: lookup.keyword,
          ok: true as const,
          items: lookup.cachedItems,
          ...lookup.scope,
        };
      }
      const outcome = fetched[misses.indexOf(lookup)];
      if (outcome.status === "rejected") {
        return {
          keyword: lookup.keyword,
          ok: false as const,
          error: toolErrorMessage(outcome.reason),
        };
      }
      // Trim noise — return only essentials per item.
      const trimmed = outcome.value.slice(0, depth).map((item) => ({
        type: item.type,
        rank: item.rank_absolute ?? item.rank_group ?? null,
        organicRank: item.type === "organic" ? (item.rank_group ?? null) : null,
        title: item.title ?? null,
        url: item.url ?? null,
        domain: item.domain ?? null,
        description: item.description ?? null,
      }));
      // DataForSEO reports "no results" transiently; don't pin that for the
      // whole window. waitUntil, not void: workerd cancels unregistered
      // pending I/O once the response is sent.
      if (trimmed.length > 0) {
        waitUntil(
          setCached(
            lookup.cacheKey,
            trimmed,
            SERP_RESULTS_CACHE_TTL_SECONDS,
          ).catch((error) => {
            console.error("mcp.serp-results.cache-write failed:", error);
          }),
        );
      }
      return {
        keyword: lookup.keyword,
        ok: true as const,
        items: trimmed,
        ...lookup.scope,
      };
    });

    const okCount = results.filter((r) => r.ok).length;
    // One budget for the whole response: ten queries split it, so a 10 × depth
    // 100 call can't render 300k characters of text.
    const budget = sectionTableBudget(results.length);
    const text =
      results
        .map((r) => {
          if (!r.ok) {
            return `"${r.keyword}": FAILED — ${r.error}`;
          }
          if (r.items.length === 0) {
            return `"${r.keyword}" (0 results)`;
          }
          return `"${r.keyword}" (${r.items.length} results):\n${formatMcpTable(r.items, SERP_ITEM_COLUMNS, budget)}`;
        })
        .join("\n\n") +
      `\n\n${okCount} of ${results.length} queries succeeded.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { results },
    });
  }),
};
