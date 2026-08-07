import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { getGoogleServiceAccountToken } from "@/server/lib/googleServiceAccount";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// ponytail: gates on "caller owns projectId" via withMcpProjectAuth, not yet
// on "projectId owns siteUrl" — the project schema has no gscSiteUrl column
// to check against. Closes the unauthenticated-tool gap; a caller who owns
// *any* project can still pass an arbitrary siteUrl. Upgrade path: add a
// per-project GSC site binding and verify it here once one exists.
const inputSchema = {
  projectId: projectIdSchema,
  siteUrl: z
    .string()
    .min(1)
    .describe(
      "Verified Search Console property URL, including sc-domain: properties where applicable.",
    ),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(25_000).optional(),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const gscSecondPageTool = {
  name: "gsc_second_page",
  config: {
    title: "Find Search Console striking distance queries",
    description:
      "Find Search Console queries averaging positions 11–15, sorted by impressions descending — the cheapest page-2-to-page-1 opportunities.",
    inputSchema,
    outputSchema: z
      .object({
        ok: z.boolean(),
        reason: z.string().optional(),
        siteUrl: z.string().optional(),
        rows: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args) => {
    const auth = await getGoogleServiceAccountToken([
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]);
    if (!("token" in auth))
      return mcpResponse({
        text: auth.setupMessage,
        structuredContent: {
          ok: false,
          reason: "google_credentials_not_configured",
          setupMessage: auth.setupMessage,
        },
      });
    try {
      const response = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startDate: args.startDate,
            endDate: args.endDate,
            dimensions: ["query", "page"],
            rowLimit: 25_000,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          `Search Console API error (${response.status}): ${(await response.text()).slice(0, 300)}`,
        );
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- response.json() is Promise<any>; the cast is required
      const data = (await response.json()) as {
        rows?: Array<{
          keys?: string[];
          clicks?: number;
          impressions?: number;
          ctr?: number;
          position?: number;
        }>;
      };
      const rows = (data.rows ?? [])
        .filter((row) => (row.position ?? 0) >= 11 && (row.position ?? 0) <= 15)
        .toSorted((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, args.limit ?? 100)
        .map((row) => ({
          query: row.keys?.[0] ?? "",
          page: row.keys?.[1] ?? "",
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        }));
      return mcpResponse({
        text: `${rows.length} striking-distance queries found for ${args.siteUrl} (positions 11–15).`,
        structuredContent: { ok: true, siteUrl: args.siteUrl, rows },
      });
    } catch (error) {
      return mcpResponse({
        text: error instanceof Error ? error.message : String(error),
        structuredContent: { ok: false, reason: "gsc_api_error" },
      });
    }
  }),
};
