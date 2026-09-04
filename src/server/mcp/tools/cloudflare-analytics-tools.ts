import { z } from "zod";
import { CloudflareAnalyticsService } from "@/server/features/cloudflare-analytics/CloudflareAnalyticsService";
import {
  cloudflareCrawlerResultSchema,
  cloudflareSecurityResultSchema,
  cloudflareTrafficResultSchema,
} from "@/server/features/cloudflare-analytics/schemas";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MCP_MAX_ROWS = 100;

const inputSchema = {
  projectId: projectIdSchema,
  from: z
    .string()
    .datetime()
    .optional()
    .describe("UTC interval start. Defaults to 24 hours before `to`."),
  to: z
    .string()
    .datetime()
    .optional()
    .describe("UTC interval end. Defaults to now."),
} as const;

type CloudflareArgs = z.infer<z.ZodObject<typeof inputSchema>>;

function resolveWindow(input: { from?: string; to?: string }) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - DAY_MS);
  if (from >= to) throw new RangeError("from must precede to");
  if (to.getTime() - from.getTime() > 31 * DAY_MS) {
    throw new RangeError("Cloudflare Analytics window cannot exceed 31 days");
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function summary(
  label: string,
  result: { status: string; warnings: string[] },
) {
  const warnings =
    result.warnings.length > 0
      ? ` Warnings: ${result.warnings.join(", ")}.`
      : "";
  return `${label}: ${result.status}.${warnings}`;
}

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const settingsPath = (projectId: string) =>
  `/p/${projectId}/settings/integrations#cloudflare-analytics`;

export const getCloudflareTrafficHealthTool = {
  name: "get_cloudflare_traffic_health",
  config: {
    title: "Get Cloudflare traffic health",
    description:
      "Read aggregate requests, status codes, 4xx/5xx counts, bytes, sampling, truncation, and dataset capabilities for the project's selected Cloudflare zone. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: cloudflareTrafficResultSchema,
    annotations,
  },
  handler: withMcpProjectAuth(async (args: CloudflareArgs, context) => {
    const result = await CloudflareAnalyticsService.trafficHealth({
      projectId: args.projectId,
      ...resolveWindow(args),
    });
    return mcpResponse({
      text: summary("Cloudflare traffic health", result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        settingsPath(args.projectId),
      ),
      structuredContent: result,
    });
  }),
};

export const getCloudflareSecurityEventsTool = {
  name: "get_cloudflare_security_events",
  config: {
    title: "Get Cloudflare security events",
    description:
      "Read aggregate Cloudflare security actions and canonical paths without IP addresses, query strings, or full User-Agent values. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: cloudflareSecurityResultSchema,
    annotations,
  },
  handler: withMcpProjectAuth(async (args: CloudflareArgs, context) => {
    let result = await CloudflareAnalyticsService.securityEvents({
      projectId: args.projectId,
      ...resolveWindow(args),
    });
    if (result.data && result.data.events.length > MCP_MAX_ROWS) {
      result = {
        ...result,
        status: "partial",
        coverage: { ...result.coverage, truncated: true },
        warnings: [...result.warnings, "mcp_rows_truncated"],
        data: {
          ...result.data,
          events: result.data.events.slice(0, MCP_MAX_ROWS),
        },
      };
    }
    return mcpResponse({
      text: summary("Cloudflare security events", result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        settingsPath(args.projectId),
      ),
      structuredContent: result,
    });
  }),
};

export const getCloudflareCrawlerAccessTool = {
  name: "get_cloudflare_crawler_access",
  config: {
    title: "Get Cloudflare crawler access",
    description:
      "Compare aggregate Googlebot and Bingbot status codes and paths using Cloudflare-verified bot detection IDs. If Bot Management does not expose the dataset, the capability is unavailable; User-Agent matching is never used. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: cloudflareCrawlerResultSchema,
    annotations,
  },
  handler: withMcpProjectAuth(async (args: CloudflareArgs, context) => {
    let result = await CloudflareAnalyticsService.crawlerAccess({
      projectId: args.projectId,
      ...resolveWindow(args),
    });
    if (result.data) {
      const truncated = result.data.crawlers.some(
        (crawler) => crawler.pages.length > MCP_MAX_ROWS,
      );
      if (truncated) {
        result = {
          ...result,
          status: "partial",
          coverage: { ...result.coverage, truncated: true },
          warnings: [...result.warnings, "mcp_rows_truncated"],
          data: {
            ...result.data,
            crawlers: result.data.crawlers.map((crawler) => ({
              ...crawler,
              pages: crawler.pages.slice(0, MCP_MAX_ROWS),
            })),
          },
        };
      }
    }
    return mcpResponse({
      text: summary("Cloudflare crawler access", result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        settingsPath(args.projectId),
      ),
      structuredContent: result,
    });
  }),
};
