import { z } from "zod";
import { SERP_ANALYSIS_DEPTH } from "@/server/lib/dataforseo";
import { buildCacheKey } from "@/server/lib/r2-cache";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { serpSchema, type serpItemSchema } from "@/shared/mcp-contracts";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import { assertLocalResearchLocation } from "@/server/features/keywords/services/research/local-volume";
import { readMergedSerps } from "@/server/features/keywords/services/research/serpReads";
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

// In the response too, not only the description: `rank` comes first and is
// otherwise the obvious number to quote.
const SERP_READING_NOTE =
  "Sites the reads agree on come first, so read the top rows as who ranks. `rank` is only a row's place in this list; quote `best position` as a site's position.";

type SerpItem = z.infer<typeof serpItemSchema>;

// `type` is load-bearing: the advanced SERP is a mixed list, so without it a
// featured_snippet or people_also_ask row (which has no domain/title/url) reads
// as an unlabeled organic position. Snippets are trimmed so the prose column
// can't dominate the table — the full text stays in structuredContent.
const SERP_ITEM_COLUMNS: McpTableColumn<SerpItem>[] = [
  { header: "rank", value: (item) => item.rank },
  { header: "type", value: (item) => item.type },
  { header: "best position", value: (item) => item.bestPosition },
  { header: "seen in (of 3 reads)", value: (item) => item.seenIn },
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
      "How many Google results to read per keyword — a multiple of 10 from 10 to 100, default 10 (page 1). Merging the reads usually returns more sites than this. Google has no offset, so a deeper read re-fetches the top too: each additional 10 adds ~3.5 credits per keyword. Only raise it when you need ranks past page 1.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getSerpResultsTool = {
  name: "get_serp_results",
  config: {
    title: "Get Google SERP results",
    description:
      "Fetch live Google organic search results for 1-10 keywords. Use this to inspect who ranks for a query, verify competitors, compare SERPs across keywords, or gather source URLs before content planning. Google serves automated readers pages that vary and are sometimes wrong, so each keyword is read 3 times and merged into one row per site, usually about 15 sites at the default depth 10. Expect 10-30 seconds. The sites the reads agree on come first, and `rank` numbers them 1 to n in that order, so it isn't a Google position. `bestPosition` is the best organic position any read gave the site, the same way the rank tracker reports it: quote that as a site's position. It can repeat or jump around from row to row, because the rows aren't one page Google served. `seenIn` says how many reads showed a row, so a site seen once is weak evidence. SERP features follow the organic rows, with no `rank` or `bestPosition`. Results still vary between calls, so use rank tracking or Search Console for a site's position over time. `url` can be a google.com/goto redirect that a plain fetch won't follow; `domain` is the reliable field. Charges credits per keyword: ~5 each at the default depth 10, and each additional 10 of depth adds ~3.5. A keyword fetched in this project in the last 12 hours with the same market, device, and depth collects those same reads again at no charge, so if a response is lost or a keyword is still running, wait a minute and repeat the same call; only a keyword whose reads all failed or came back empty is read and charged again. Per-keyword errors don't fail the batch.",
    inputSchema,
    outputSchema: serpSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const depth = args.depth ?? SERP_ANALYSIS_DEPTH;
    const lookups = await Promise.all(
      args.queries.map(async (q) => {
        try {
          const market = resolveMarket(q, context.project);
          const device = q.device ?? "desktop";
          if (q.locationName) {
            await assertLocalResearchLocation(
              market.locationCode,
              q.locationName,
            );
          }
          return {
            ok: true as const,
            keyword: q.keyword,
            scope: { ...market, locationName: q.locationName, device },
            query: {
              keyword: q.keyword,
              ...market,
              locationName: q.locationName,
              depth,
              device,
            },
            receiptKey: await buildCacheKey("mcp:serp-reads", {
              organizationId: context.billing.organizationId,
              projectId: args.projectId,
              keyword: q.keyword,
              ...market,
              locationName: q.locationName,
              depth,
              device,
            }),
          };
        } catch (error) {
          return { ok: false as const, keyword: q.keyword, error };
        }
      }),
    );

    const requests = lookups.flatMap((lookup) => (lookup.ok ? [lookup] : []));
    const outcomes = await readMergedSerps(context.billing, requests);

    const results = lookups.map((lookup) => {
      if (!lookup.ok) {
        return {
          keyword: lookup.keyword,
          ok: false as const,
          error: toolErrorMessage(lookup.error),
        };
      }
      const outcome = outcomes[requests.indexOf(lookup)];
      if (outcome.status === "failed") {
        return {
          keyword: lookup.keyword,
          ok: false as const,
          error: toolErrorMessage(outcome.error),
        };
      }
      if (outcome.status === "processing") {
        return {
          keyword: lookup.keyword,
          ok: false as const,
          error:
            "This search is still running. Call get_serp_results again with the same arguments in about a minute to collect it at no extra charge.",
        };
      }
      return {
        keyword: lookup.keyword,
        ok: true as const,
        // Trim noise — return only essentials per item.
        items: outcome.items.map((item, index) => {
          const organic = item.type === "organic";
          return {
            type: item.type,
            // Organic rows come first, so the index is their place in the list.
            rank: organic ? index + 1 : null,
            bestPosition: organic ? (item.rank_group ?? null) : null,
            seenIn: item.seenIn,
            title: item.title ?? null,
            url: item.url ?? null,
            domain: item.domain ?? null,
            description: item.description ?? null,
          };
        }),
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
      `\n\n${okCount} of ${results.length} queries succeeded.` +
      (okCount > 0 ? `\n${SERP_READING_NOTE}` : "");

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
