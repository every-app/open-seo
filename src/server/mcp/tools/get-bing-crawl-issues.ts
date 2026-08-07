import { z } from "zod";
import {
  BingNotConnectedError,
  BingService,
} from "@/server/features/bing/services/BingService";
import { BingApiError, BingTokenError } from "@/server/lib/bingClient";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";

const inputSchema = {
  projectId: projectIdSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Maximum number of crawl issues to return (default 100)."),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function describeBingError(error: unknown): string {
  if (error instanceof BingNotConnectedError) {
    return "Bing Webmaster is not connected for this project.";
  }
  if (error instanceof BingTokenError) {
    return "The Bing Webmaster connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof BingApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export const getBingCrawlIssuesTool = {
  name: "get_bing_crawl_issues",
  config: {
    title: "Get Bing Webmaster crawl issues",
    description:
      "Read crawl errors and warnings for the connected Bing Webmaster property. Returns first-party crawl issue rows and never changes the site.",
    inputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      connectedBy: z.string().nullable().optional(),
      rowCount: z.number().optional(),
      issues: z.array(z.record(z.string(), z.unknown())).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(context, args.projectId);

    try {
      const result = await BingService.getCrawlIssues({
        projectId: args.projectId,
      });
      const issues = result.issues.slice(0, args.limit ?? 100);
      return mcpResponse({
        text: `${result.siteUrl} · ${issues.length} Bing crawl issue${issues.length === 1 ? "" : "s"}.`,
        meta,
        structuredContent: {
          ok: true,
          siteUrl: result.siteUrl,
          connectedBy: result.connectedBy,
          rowCount: issues.length,
          issues,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof BingNotConnectedError;
      return mcpResponse({
        text: `${describeBingError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
        meta,
        structuredContent: {
          ok: false,
          reason: isNotConnected ? "not_connected" : "api_error",
          connectUrl,
        },
      });
    }
  }),
};
