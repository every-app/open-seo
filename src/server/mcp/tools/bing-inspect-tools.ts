import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import {
  BingNotConnectedError,
  BingService,
  isExpectedGrantFailure,
} from "@/server/features/bing/services/BingService";

const inspectInputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().url())
    .min(1)
    .max(10)
    .describe(
      "1–10 absolute URLs to inspect. Each should belong to the connected Bing site.",
    ),
} as const;

type InspectArgs = z.infer<z.ZodObject<typeof inspectInputSchema>>;

function isoDay(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export const inspectBingUrlsTool = {
  name: "inspect_bing_urls",
  config: {
    title: "Inspect URLs in Bing Webmaster Tools",
    description:
      "Per-URL crawl evidence from Bing (GetUrlInfo) for up to 10 URLs of the connected site: when Bing first discovered the URL, when Bingbot last crawled it, document size, and whether it's a page. known=false means Bing has never discovered the URL at all. Bing's index feeds ChatGPT search and Copilot, so recent lastCrawledAt is the closest available signal that a page can surface there. Bing exposes no explicit indexed yes/no flag and no per-URL HTTP status — do not overclaim beyond discovery and crawl recency. Per-URL failures are reported inline. Read-only; uses no credits.",
    inputSchema: inspectInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      results: z
        .array(
          z
            .object({
              url: z.string(),
              known: z.boolean().optional(),
              discoveredAt: z.string().nullable().optional(),
              lastCrawledAt: z.string().nullable().optional(),
              documentSize: z.number().optional(),
              isPage: z.boolean().optional(),
              error: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: InspectArgs, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    try {
      const { siteUrl, results } = await BingService.inspectUrls({
        projectId: args.projectId,
        urls: args.urls,
      });

      const lines = results.map((r) => {
        // `!== undefined`, not truthiness: the failure arm's `error` is a
        // string, so an empty message is falsy and would fall through to the
        // crawl-evidence branch — reporting a URL that errored as one Bing has
        // never discovered. It also leaves the union un-narrowed, which is why
        // `r.known` below does not typecheck under a truthiness test.
        if (r.error !== undefined) return `  ${r.url} — error: ${r.error}`;
        if (!r.known) return `  ${r.url} — unknown to Bing (never discovered)`;
        const crawled = isoDay(r.lastCrawledAt);
        return `  ${r.url} — discovered ${isoDay(r.discoveredAt)}, last crawled ${crawled ?? "never"}`;
      });
      const text =
        `${siteUrl} · inspected ${results.length} URL${results.length === 1 ? "" : "s"}\n` +
        lines.join("\n");

      return mcpResponse({
        text,
        meta,
        structuredContent: { ok: true, siteUrl, results },
      });
    } catch (error) {
      if (error instanceof BingNotConnectedError) {
        return mcpResponse({
          text: `Bing Webmaster is not connected for this project. Connect it in project settings: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "not_connected",
            connectUrl,
          },
        });
      }
      if (isExpectedGrantFailure(error)) {
        return mcpResponse({
          text: `The Bing Webmaster connection has expired or was revoked. Reconnect it in project settings: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "api_error",
            connectUrl,
          },
        });
      }
      throw error;
    }
  }),
};
