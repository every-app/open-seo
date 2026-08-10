import {
  type CallToolResult,
  McpServer,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { createMcpToolContext, type ToolContext } from "@/server/mcp/context";
import { objectSchema } from "@/server/mcp/output-schemas";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { addRankTrackingKeywordsTool } from "@/server/mcp/tools/add-rank-tracking-keywords";
import { createRankTrackerTool } from "@/server/mcp/tools/create-rank-tracker";
import { estimateRankTrackerCostTool } from "@/server/mcp/tools/estimate-rank-tracker-cost";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { removeRankTrackingKeywordsTool } from "@/server/mcp/tools/remove-rank-tracking-keywords";
import { runRankTrackerTool } from "@/server/mcp/tools/run-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
import {
  getGoogleAnalyticsAudienceBreakdownTool,
  getGoogleAnalyticsEcommercePerformanceTool,
  getGoogleAnalyticsKeyEventsTool,
  getGoogleAnalyticsMeasurementHealthTool,
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsSiteSearchTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
  getSearchOpportunitiesTool,
} from "@/server/mcp/tools/google-analytics-tools";
import { createProjectTool } from "@/server/mcp/tools/create-project";
import { listProjectsTool } from "@/server/mcp/tools/list-projects";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import {
  findSerpCompetitorsTool,
  getGoogleBusinessQuestionsTool,
  getKeywordMetricsTool,
  getLocalSerpResultsTool,
  getRankedKeywordsTool,
  searchLocalBusinessesTool,
} from "@/server/mcp/tools/dataforseo-research-tools";
import { researchKeywordsTool } from "@/server/mcp/tools/research-keywords";
import { saveKeywordsTool } from "@/server/mcp/tools/save-keywords";
import {
  getSearchConsolePerformanceTool,
  inspectUrlsTool,
} from "@/server/mcp/tools/search-console-tools";
import {
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import { whoamiTool } from "@/server/mcp/tools/whoami";

type ToolSchema = z.ZodType | z.ZodRawShape;

// Tools declare inputSchema as either a raw Zod shape (most tools) or a full
// z.object (the GA4 tools); both normalize to one object schema at
// registration.
type ToolArgs<Input extends ToolSchema> = Input extends z.ZodType
  ? z.infer<Input>
  : Input extends z.ZodRawShape
    ? z.infer<z.ZodObject<Input>>
    : never;

type OpenSeoToolDefinition<Input extends ToolSchema> = {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema: Input;
    outputSchema?: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (
    args: ToolArgs<Input>,
    context: ToolContext,
  ) => CallToolResult | Promise<CallToolResult>;
};

function registerOpenSeoTool<Input extends ToolSchema>(
  server: McpServer,
  tool: OpenSeoToolDefinition<Input>,
) {
  const outputSchema = objectSchema(tool.config.outputSchema);
  const handler = instrumentMcpToolHandler(
    tool.name,
    outputSchema,
    tool.handler,
  );

  server.registerTool(
    tool.name,
    {
      ...tool.config,
      inputSchema: objectSchema(tool.config.inputSchema),
      outputSchema,
    },
    (args, context) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- args were validated against the tool's own inputSchema just above
      handler(args as ToolArgs<Input>, createMcpToolContext(context)),
  );
}

export function createOpenSeoMcpServer() {
  const server = new McpServer(
    {
      name: "OpenSEO MCP",
      title: "OpenSEO",
      version: "0.0.11",
      description:
        "SEO research tools for AI agents: keyword research and metrics, SERP and local SERP results, domain and backlink analysis, rank tracking, and Google Search Console performance.",
      websiteUrl: "https://openseo.so",
      icons: [
        {
          src: "https://openseo.so/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    },
    {
      instructions:
        "OpenSEO research tools use credits. Proceed with normal focused research, but ask the user for confirmation before planned batches over 2,000 credits.",
    },
  );

  registerOpenSeoTool(server, whoamiTool);
  registerOpenSeoTool(server, listProjectsTool);
  registerOpenSeoTool(server, createProjectTool);
  registerOpenSeoTool(server, listSavedKeywordsTool);
  registerOpenSeoTool(server, researchKeywordsTool);
  registerOpenSeoTool(server, saveKeywordsTool);
  registerOpenSeoTool(server, getDomainOverviewTool);
  registerOpenSeoTool(server, getDomainKeywordSuggestionsTool);
  registerOpenSeoTool(server, getBacklinksOverviewTool);
  registerOpenSeoTool(server, getBacklinksProfileTool);
  registerOpenSeoTool(server, getSerpResultsTool);
  registerOpenSeoTool(server, createRankTrackerTool);
  registerOpenSeoTool(server, getRankTrackerTool);
  registerOpenSeoTool(server, addRankTrackingKeywordsTool);
  registerOpenSeoTool(server, removeRankTrackingKeywordsTool);
  registerOpenSeoTool(server, estimateRankTrackerCostTool);
  registerOpenSeoTool(server, runRankTrackerTool);
  registerOpenSeoTool(server, getRankedKeywordsTool);
  registerOpenSeoTool(server, findSerpCompetitorsTool);
  registerOpenSeoTool(server, searchLocalBusinessesTool);
  registerOpenSeoTool(server, getLocalSerpResultsTool);
  registerOpenSeoTool(server, getGoogleBusinessQuestionsTool);
  registerOpenSeoTool(server, getKeywordMetricsTool);
  registerOpenSeoTool(server, getSearchConsolePerformanceTool);
  registerOpenSeoTool(server, inspectUrlsTool);
  registerOpenSeoTool(server, getGoogleAnalyticsOrganicLandingPagesTool);
  registerOpenSeoTool(server, getGoogleAnalyticsPagePerformanceTool);
  registerOpenSeoTool(server, getGoogleAnalyticsKeyEventsTool);
  registerOpenSeoTool(server, getSearchOpportunitiesTool);
  registerOpenSeoTool(server, getGoogleAnalyticsOrganicOverviewTool);
  registerOpenSeoTool(server, getGoogleAnalyticsTrafficAcquisitionTool);
  registerOpenSeoTool(server, getGoogleAnalyticsMeasurementHealthTool);
  registerOpenSeoTool(server, getGoogleAnalyticsEcommercePerformanceTool);
  registerOpenSeoTool(server, getGoogleAnalyticsSiteSearchTool);
  registerOpenSeoTool(server, getGoogleAnalyticsAudienceBreakdownTool);
  registerOpenSeoTool(server, runSiteAuditTool);
  registerOpenSeoTool(server, getAuditStatusTool);
  registerOpenSeoTool(server, getAuditIssuesTool);
  registerOpenSeoTool(server, getAuditPagesTool);

  return server;
}
