import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
import { listProjectsTool } from "@/server/mcp/tools/list-projects";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import { researchKeywordsTool } from "@/server/mcp/tools/research-keywords";
import { saveKeywordsTool } from "@/server/mcp/tools/save-keywords";
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
}
