import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";
import {
  getBingPerformanceTool,
  getBingQueriesTool,
} from "@/server/mcp/tools/bing-tools";
import { inspectBingUrlsTool } from "@/server/mcp/tools/bing-inspect-tools";
import { getBingAiCitationsTool } from "@/server/mcp/tools/bing-ai-citation-tools";
import { getVercelTrafficTool } from "@/server/mcp/tools/vercel-tools";
import {
  getRapidapiSnapshotsTool,
  getStripeRevenueTool,
} from "@/server/mcp/tools/revenue-tools";
import {
  getPagespeedInsightsTool,
  getPagespeedIssuesTool,
} from "@/server/mcp/tools/pagespeed-tools";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
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
import { validateStructuredDataTool } from "@/server/mcp/tools/structured-data-tools";
import { whoamiTool } from "@/server/mcp/tools/whoami";

// Each handler is wrapped with instrumentMcpToolHandler so failures reach
// PostHog — the MCP route has no error middleware of its own. Tools are
// registered one explicit call at a time (not via a loop/helper) so each one's
// input/output schema types stay concrete, which the SDK's registerTool
// generics require to type the handler callback.
export function registerOpenSeoMcpTools(server: McpServer) {
  server.registerTool(
    whoamiTool.name,
    whoamiTool.config,
    instrumentMcpToolHandler(
      whoamiTool.name,
      whoamiTool.config.outputSchema,
      whoamiTool.handler,
    ),
  );
  server.registerTool(
    listProjectsTool.name,
    listProjectsTool.config,
    instrumentMcpToolHandler(
      listProjectsTool.name,
      listProjectsTool.config.outputSchema,
      listProjectsTool.handler,
    ),
  );
  server.registerTool(
    createProjectTool.name,
    createProjectTool.config,
    instrumentMcpToolHandler(
      createProjectTool.name,
      createProjectTool.config.outputSchema,
      createProjectTool.handler,
    ),
  );
  server.registerTool(
    listSavedKeywordsTool.name,
    listSavedKeywordsTool.config,
    instrumentMcpToolHandler(
      listSavedKeywordsTool.name,
      listSavedKeywordsTool.config.outputSchema,
      listSavedKeywordsTool.handler,
    ),
  );
  server.registerTool(
    researchKeywordsTool.name,
    researchKeywordsTool.config,
    instrumentMcpToolHandler(
      researchKeywordsTool.name,
      researchKeywordsTool.config.outputSchema,
      researchKeywordsTool.handler,
    ),
  );
  server.registerTool(
    saveKeywordsTool.name,
    saveKeywordsTool.config,
    instrumentMcpToolHandler(
      saveKeywordsTool.name,
      saveKeywordsTool.config.outputSchema,
      saveKeywordsTool.handler,
    ),
  );
  server.registerTool(
    getDomainOverviewTool.name,
    getDomainOverviewTool.config,
    instrumentMcpToolHandler(
      getDomainOverviewTool.name,
      getDomainOverviewTool.config.outputSchema,
      getDomainOverviewTool.handler,
    ),
  );
  server.registerTool(
    getDomainKeywordSuggestionsTool.name,
    getDomainKeywordSuggestionsTool.config,
    instrumentMcpToolHandler(
      getDomainKeywordSuggestionsTool.name,
      getDomainKeywordSuggestionsTool.config.outputSchema,
      getDomainKeywordSuggestionsTool.handler,
    ),
  );
  server.registerTool(
    getBacklinksOverviewTool.name,
    getBacklinksOverviewTool.config,
    instrumentMcpToolHandler(
      getBacklinksOverviewTool.name,
      getBacklinksOverviewTool.config.outputSchema,
      getBacklinksOverviewTool.handler,
    ),
  );
  server.registerTool(
    getBacklinksProfileTool.name,
    getBacklinksProfileTool.config,
    instrumentMcpToolHandler(
      getBacklinksProfileTool.name,
      getBacklinksProfileTool.config.outputSchema,
      getBacklinksProfileTool.handler,
    ),
  );
  server.registerTool(
    getSerpResultsTool.name,
    getSerpResultsTool.config,
    instrumentMcpToolHandler(
      getSerpResultsTool.name,
      getSerpResultsTool.config.outputSchema,
      getSerpResultsTool.handler,
    ),
  );
  server.registerTool(
    getRankTrackerTool.name,
    getRankTrackerTool.config,
    instrumentMcpToolHandler(
      getRankTrackerTool.name,
      getRankTrackerTool.config.outputSchema,
      getRankTrackerTool.handler,
    ),
  );
  server.registerTool(
    getRankedKeywordsTool.name,
    getRankedKeywordsTool.config,
    instrumentMcpToolHandler(
      getRankedKeywordsTool.name,
      getRankedKeywordsTool.config.outputSchema,
      getRankedKeywordsTool.handler,
    ),
  );
  server.registerTool(
    findSerpCompetitorsTool.name,
    findSerpCompetitorsTool.config,
    instrumentMcpToolHandler(
      findSerpCompetitorsTool.name,
      findSerpCompetitorsTool.config.outputSchema,
      findSerpCompetitorsTool.handler,
    ),
  );
  server.registerTool(
    searchLocalBusinessesTool.name,
    searchLocalBusinessesTool.config,
    instrumentMcpToolHandler(
      searchLocalBusinessesTool.name,
      searchLocalBusinessesTool.config.outputSchema,
      searchLocalBusinessesTool.handler,
    ),
  );
  server.registerTool(
    getLocalSerpResultsTool.name,
    getLocalSerpResultsTool.config,
    instrumentMcpToolHandler(
      getLocalSerpResultsTool.name,
      getLocalSerpResultsTool.config.outputSchema,
      getLocalSerpResultsTool.handler,
    ),
  );
  server.registerTool(
    getGoogleBusinessQuestionsTool.name,
    getGoogleBusinessQuestionsTool.config,
    instrumentMcpToolHandler(
      getGoogleBusinessQuestionsTool.name,
      getGoogleBusinessQuestionsTool.config.outputSchema,
      getGoogleBusinessQuestionsTool.handler,
    ),
  );
  server.registerTool(
    getKeywordMetricsTool.name,
    getKeywordMetricsTool.config,
    instrumentMcpToolHandler(
      getKeywordMetricsTool.name,
      getKeywordMetricsTool.config.outputSchema,
      getKeywordMetricsTool.handler,
    ),
  );
  server.registerTool(
    getSearchConsolePerformanceTool.name,
    getSearchConsolePerformanceTool.config,
    instrumentMcpToolHandler(
      getSearchConsolePerformanceTool.name,
      getSearchConsolePerformanceTool.config.outputSchema,
      getSearchConsolePerformanceTool.handler,
    ),
  );
  server.registerTool(
    getBingPerformanceTool.name,
    getBingPerformanceTool.config,
    instrumentMcpToolHandler(
      getBingPerformanceTool.name,
      getBingPerformanceTool.config.outputSchema,
      getBingPerformanceTool.handler,
    ),
  );
  server.registerTool(
    getBingQueriesTool.name,
    getBingQueriesTool.config,
    instrumentMcpToolHandler(
      getBingQueriesTool.name,
      getBingQueriesTool.config.outputSchema,
      getBingQueriesTool.handler,
    ),
  );
  server.registerTool(
    inspectBingUrlsTool.name,
    inspectBingUrlsTool.config,
    instrumentMcpToolHandler(
      inspectBingUrlsTool.name,
      inspectBingUrlsTool.config.outputSchema,
      inspectBingUrlsTool.handler,
    ),
  );
  server.registerTool(
    getBingAiCitationsTool.name,
    getBingAiCitationsTool.config,
    instrumentMcpToolHandler(
      getBingAiCitationsTool.name,
      getBingAiCitationsTool.config.outputSchema,
      getBingAiCitationsTool.handler,
    ),
  );
  server.registerTool(
    getVercelTrafficTool.name,
    getVercelTrafficTool.config,
    instrumentMcpToolHandler(
      getVercelTrafficTool.name,
      getVercelTrafficTool.config.outputSchema,
      getVercelTrafficTool.handler,
    ),
  );
  server.registerTool(
    getRapidapiSnapshotsTool.name,
    getRapidapiSnapshotsTool.config,
    instrumentMcpToolHandler(
      getRapidapiSnapshotsTool.name,
      getRapidapiSnapshotsTool.config.outputSchema,
      getRapidapiSnapshotsTool.handler,
    ),
  );
  server.registerTool(
    getStripeRevenueTool.name,
    getStripeRevenueTool.config,
    instrumentMcpToolHandler(
      getStripeRevenueTool.name,
      getStripeRevenueTool.config.outputSchema,
      getStripeRevenueTool.handler,
    ),
  );
  server.registerTool(
    getPagespeedInsightsTool.name,
    getPagespeedInsightsTool.config,
    instrumentMcpToolHandler(
      getPagespeedInsightsTool.name,
      getPagespeedInsightsTool.config.outputSchema,
      getPagespeedInsightsTool.handler,
    ),
  );
  server.registerTool(
    getPagespeedIssuesTool.name,
    getPagespeedIssuesTool.config,
    instrumentMcpToolHandler(
      getPagespeedIssuesTool.name,
      getPagespeedIssuesTool.config.outputSchema,
      getPagespeedIssuesTool.handler,
    ),
  );
  server.registerTool(
    inspectUrlsTool.name,
    inspectUrlsTool.config,
    instrumentMcpToolHandler(
      inspectUrlsTool.name,
      inspectUrlsTool.config.outputSchema,
      inspectUrlsTool.handler,
    ),
  );
  server.registerTool(
    validateStructuredDataTool.name,
    validateStructuredDataTool.config,
    instrumentMcpToolHandler(
      validateStructuredDataTool.name,
      validateStructuredDataTool.config.outputSchema,
      validateStructuredDataTool.handler,
    ),
  );
  server.registerTool(
    runSiteAuditTool.name,
    runSiteAuditTool.config,
    instrumentMcpToolHandler(
      runSiteAuditTool.name,
      runSiteAuditTool.config.outputSchema,
      runSiteAuditTool.handler,
    ),
  );
  server.registerTool(
    getAuditStatusTool.name,
    getAuditStatusTool.config,
    instrumentMcpToolHandler(
      getAuditStatusTool.name,
      getAuditStatusTool.config.outputSchema,
      getAuditStatusTool.handler,
    ),
  );
  server.registerTool(
    getAuditIssuesTool.name,
    getAuditIssuesTool.config,
    instrumentMcpToolHandler(
      getAuditIssuesTool.name,
      getAuditIssuesTool.config.outputSchema,
      getAuditIssuesTool.handler,
    ),
  );
  server.registerTool(
    getAuditPagesTool.name,
    getAuditPagesTool.config,
    instrumentMcpToolHandler(
      getAuditPagesTool.name,
      getAuditPagesTool.config.outputSchema,
      getAuditPagesTool.handler,
    ),
  );
}
