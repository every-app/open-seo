import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LOCATION_CODE,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const querySchema = z.object({
  keyword: z.string().min(1),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
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
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getSerpResultsTool = {
  name: "get_serp_results",
  config: {
    title: "Get Google SERP results",
    description:
      "Fetch live Google organic search results for 1-10 keywords. Use this to inspect who ranks for a query, verify competitors, compare SERPs across keywords, or gather source URLs before content planning. Charges credits per keyword (~30-60 each). Does not save results to OpenSEO. Per-keyword errors don't fail the batch.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const client = createDataforseoClient(context.billing);

    const results = await Promise.all(
      args.queries.map(async (q) => {
        try {
          const items = await client.serp.live({
            keyword: q.keyword,
            locationCode: q.locationCode ?? DEFAULT_LOCATION_CODE,
            languageCode: q.languageCode ?? DEFAULT_LANGUAGE_CODE,
          });
          // Trim noise — return only essentials per item.
          const trimmed = items.slice(0, 20).map((item) => ({
            type: item.type,
            rank: item.rank_absolute ?? item.rank_group ?? null,
            title: item.title ?? null,
            url: item.url ?? null,
            domain: item.domain ?? null,
            description: item.description ?? null,
          }));
          return { keyword: q.keyword, ok: true as const, items: trimmed };
        } catch (error) {
          return {
            keyword: q.keyword,
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    const text =
      results
        .map((r) => {
          if (r.ok) {
            const top = r.items.slice(0, 3);
            return `"${r.keyword}" (${r.items.length} results):\n${top
              .map(
                (it) =>
                  `  #${it.rank ?? "?"}  ${it.domain ?? "?"} — ${it.title ?? "?"}`,
              )
              .join("\n")}`;
          }
          return `"${r.keyword}": FAILED — ${r.error}`;
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
