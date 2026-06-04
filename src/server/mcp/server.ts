import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
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
import { whoamiTool } from "@/server/mcp/tools/whoami";

export function registerOpenSeoMcpTools(server: McpServer) {
  server.registerTool(whoamiTool.name, whoamiTool.config, whoamiTool.handler);
  server.registerTool(
    listProjectsTool.name,
    listProjectsTool.config,
    listProjectsTool.handler,
  );
  server.registerTool(
    listSavedKeywordsTool.name,
    listSavedKeywordsTool.config,
    listSavedKeywordsTool.handler,
  );
  server.registerTool(
    researchKeywordsTool.name,
    researchKeywordsTool.config,
    researchKeywordsTool.handler,
  );
  server.registerTool(
    saveKeywordsTool.name,
    saveKeywordsTool.config,
    saveKeywordsTool.handler,
  );
  server.registerTool(
    getDomainOverviewTool.name,
    getDomainOverviewTool.config,
    getDomainOverviewTool.handler,
  );
  server.registerTool(
    getDomainKeywordSuggestionsTool.name,
    getDomainKeywordSuggestionsTool.config,
    getDomainKeywordSuggestionsTool.handler,
  );
  server.registerTool(
    getBacklinksOverviewTool.name,
    getBacklinksOverviewTool.config,
    getBacklinksOverviewTool.handler,
  );
  server.registerTool(
    getSerpResultsTool.name,
    getSerpResultsTool.config,
    getSerpResultsTool.handler,
  );
  server.registerTool(
    getRankTrackerTool.name,
    getRankTrackerTool.config,
    getRankTrackerTool.handler,
  );
  server.registerTool(
    getRankedKeywordsTool.name,
    getRankedKeywordsTool.config,
    getRankedKeywordsTool.handler,
  );
  server.registerTool(
    findSerpCompetitorsTool.name,
    findSerpCompetitorsTool.config,
    findSerpCompetitorsTool.handler,
  );
  server.registerTool(
    searchLocalBusinessesTool.name,
    searchLocalBusinessesTool.config,
    searchLocalBusinessesTool.handler,
  );
  server.registerTool(
    getLocalSerpResultsTool.name,
    getLocalSerpResultsTool.config,
    getLocalSerpResultsTool.handler,
  );
  server.registerTool(
    getGoogleBusinessQuestionsTool.name,
    getGoogleBusinessQuestionsTool.config,
    getGoogleBusinessQuestionsTool.handler,
  );
  server.registerTool(
    getKeywordMetricsTool.name,
    getKeywordMetricsTool.config,
    getKeywordMetricsTool.handler,
  );
  server.registerTool(
    getSearchConsolePerformanceTool.name,
    getSearchConsolePerformanceTool.config,
    getSearchConsolePerformanceTool.handler,
  );
  server.registerTool(
    inspectUrlsTool.name,
    inspectUrlsTool.config,
    inspectUrlsTool.handler,
  );
}
