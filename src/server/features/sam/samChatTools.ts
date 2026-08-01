import { tool, type Tool, type ToolSet } from "ai";
import { z, type ZodRawShape } from "zod";
import { withPgClient } from "@/db";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createWorkersOAuthMcpProps,
  type McpToolAuthContext,
  type ToolExtra,
} from "@/server/mcp/context";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
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
import { discoverSiteUrls, readPages, readSite } from "@/server/lib/scrape";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";

// SAM reads more of a site than the onboarding preview: enough pages to work
// out what a business does, sells, and positions against on its own.
const SAM_MAX_SCRAPE_PAGES = 10;
const SAM_MAX_MAPPED_URLS = 60;

// Shape of the MCP tool objects exported from src/server/mcp/tools/*. SAM reuses
// the exact same definitions the MCP server registers, so the in-app agent and
// the MCP server can never drift in what a tool does or how it bills.
type McpToolDefinition<Shape extends ZodRawShape> = {
  config: { description: string; inputSchema: Shape };
  handler: (
    args: z.infer<z.ZodObject<Shape>>,
    extra: ToolExtra,
  ) => Promise<CallToolResult>;
};

// Flatten an MCP CallToolResult into a plain value for the model: the handler's
// human-readable text summary plus the structured data it returned.
function toModelOutput(result: CallToolResult): unknown {
  const summary = (result.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
  return result.structuredContent
    ? { summary, data: result.structuredContent }
    : { summary };
}

// Adapt one MCP tool into an AI SDK tool. The MCP handler reads auth from `extra`
// (via requireMcpToolAuthContext) and self-gates project access against the org,
// so SAM gets identical scoping and metering for free.
//
// SAM always runs inside one project (the session row), so we bind that project
// server-side: any tool with a `projectId` input has it stripped from the schema
// the model sees and injected at call time. The model never has to know or pass
// the id, can't target another project, and can't hallucinate a wrong one.
function adaptMcpTool<Shape extends ZodRawShape>(
  def: McpToolDefinition<Shape>,
  extra: ToolExtra,
  projectId: string,
): Tool {
  const { projectId: _projectIdSchema, ...modelShape } = def.config.inputSchema;
  const bindsProject = "projectId" in def.config.inputSchema;

  return tool({
    description: def.config.description,
    inputSchema: z.object(bindsProject ? modelShape : def.config.inputSchema),
    execute: async (args) => {
      // Reconstruct the handler's validated arg shape by injecting the session
      // projectId that we stripped from the model-facing schema above.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- projectId re-added to rebuild the tool's Shape; the handler re-validates project access
      const fullArgs = (bindsProject
        ? { ...args, projectId }
        : args) as unknown as z.infer<z.ZodObject<Shape>>;
      try {
        // Tool calls run inside Think's inference loop, outside any ambient
        // request scope, so each execution scopes its own Postgres client
        // (no-op in D1 mode) — same rule as the DO's other DB-touching seams.
        return toModelOutput(
          await withPgClient(() => def.handler(fullArgs, extra)),
        );
      } catch (error) {
        // Surface the failure to the model so it can recover or report it,
        // rather than aborting the whole turn on one bad tool call.
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

// Free (credit-less) site-reading tools, mirroring the onboarding agent's
// read_website but split into discovery + reading so the model can pick which
// pages to read instead of blindly taking the first N sitemap entries.
function scrapeTools(projectDomain: string | null): ToolSet {
  return {
    map_links: tool({
      description:
        "List a site's page URLs (homepage plus its sitemap) so you can choose which pages to read with read_pages. Defaults to the project's own site; pass `domain` to map another site (e.g. a competitor). Uses no credits.",
      inputSchema: z.object({
        domain: z
          .string()
          .optional()
          .describe("Domain or URL to map. Omit for the project's own site."),
      }),
      execute: async ({ domain }) => {
        const target = domain ?? projectDomain;
        if (!target) {
          return {
            error:
              "This project has no website set — ask the user for their site first.",
          };
        }
        const result = await discoverSiteUrls(target, SAM_MAX_MAPPED_URLS);
        return result.blocked
          ? { blocked: true, urls: [], note: "Could not reach the site." }
          : { blocked: false, urls: result.urls };
      },
    }),
    read_pages: tool({
      description: `Read up to ${SAM_MAX_SCRAPE_PAGES} web pages as plain text — the project's own pages or anyone else's (competitors, references). Pass specific \`urls\` (usually picked from map_links); omit to read a representative sample of the project's own site. Uses no credits.`,
      inputSchema: z.object({
        urls: z
          .array(z.string().url())
          .max(SAM_MAX_SCRAPE_PAGES)
          .optional()
          .describe(
            `Specific page URLs to read (max ${SAM_MAX_SCRAPE_PAGES}). Omit to read the project's own site.`,
          ),
      }),
      execute: async ({ urls }) => {
        const site =
          urls && urls.length > 0
            ? await readPages(urls, SAM_MAX_SCRAPE_PAGES)
            : projectDomain
              ? await readSite(projectDomain, SAM_MAX_SCRAPE_PAGES)
              : null;
        if (!site) {
          return {
            error:
              "This project has no website set — ask the user for their site, or pass explicit urls.",
          };
        }
        if (site.blocked) {
          return {
            blocked: true,
            pages: [],
            note: "Could not read the requested page(s). Ask the user to describe the site instead, and say you couldn't read it.",
          };
        }
        return { blocked: false, pages: site.pages };
      },
    }),
  };
}

/**
 * Builds SAM's tool surface as an AI SDK ToolSet: the full MCP toolset plus the
 * free site-reading tools. Every tool the OpenSEO MCP server exposes is
 * available; auth/billing context is carried on a synthetic `ToolExtra` the
 * handlers read exactly as they would on the real MCP route. DataForSEO spend
 * is metered inside the shared client, so tool calls draw down the org's
 * credits automatically.
 */
export function buildSamMcpTools(
  authContext: McpToolAuthContext,
  project: { id: string; domain: string | null },
): ToolSet {
  const projectId = project.id;
  const extra: ToolExtra = {
    // Placeholder to satisfy ToolExtra — no tool handler or the DataForSEO
    // client reads this signal (true on the real MCP route too), so aborting a
    // turn does not cancel in-flight tool requests.
    signal: new AbortController().signal,
    requestId: 0,
    authInfo: {
      token: "sam-session",
      clientId: authContext.clientId ?? "sam",
      scopes: authContext.scopes,
      extra: createWorkersOAuthMcpProps(authContext),
    },
    sendNotification: () => Promise.resolve(),
    sendRequest: () =>
      Promise.reject(new Error("sendRequest is unsupported in the SAM agent")),
  };

  // Note: no `list_projects`. SAM is bound to the session's project, so
  // discovering other projects isn't part of its job — every project-scoped tool
  // below has `projectId` injected server-side by adaptMcpTool.
  return {
    // On-demand product reference (kept out of the system prompt: inlining it
    // made the agent narrate hosted/self-hosted framing at signed-in users).
    get_product_info: tool({
      description:
        "The OpenSEO fact sheet: what the product does, plans/pricing, credit costs, integrations, MCP setup. Call before answering questions about OpenSEO itself. Uses no credits.",
      inputSchema: z.object({}),
      execute: () => Promise.resolve({ factSheet: openSeoFactSheet }),
    }),
    ...scrapeTools(project.domain),
    whoami: adaptMcpTool(whoamiTool, extra, projectId),
    list_saved_keywords: adaptMcpTool(listSavedKeywordsTool, extra, projectId),
    research_keywords: adaptMcpTool(researchKeywordsTool, extra, projectId),
    save_keywords: adaptMcpTool(saveKeywordsTool, extra, projectId),
    get_domain_overview: adaptMcpTool(getDomainOverviewTool, extra, projectId),
    get_domain_keyword_suggestions: adaptMcpTool(
      getDomainKeywordSuggestionsTool,
      extra,
      projectId,
    ),
    get_backlinks_overview: adaptMcpTool(
      getBacklinksOverviewTool,
      extra,
      projectId,
    ),
    get_backlinks_profile: adaptMcpTool(
      getBacklinksProfileTool,
      extra,
      projectId,
    ),
    get_serp_results: adaptMcpTool(getSerpResultsTool, extra, projectId),
    get_rank_tracker: adaptMcpTool(getRankTrackerTool, extra, projectId),
    get_ranked_keywords: adaptMcpTool(getRankedKeywordsTool, extra, projectId),
    find_serp_competitors: adaptMcpTool(
      findSerpCompetitorsTool,
      extra,
      projectId,
    ),
    search_local_businesses: adaptMcpTool(
      searchLocalBusinessesTool,
      extra,
      projectId,
    ),
    get_local_serp_results: adaptMcpTool(
      getLocalSerpResultsTool,
      extra,
      projectId,
    ),
    get_google_business_questions: adaptMcpTool(
      getGoogleBusinessQuestionsTool,
      extra,
      projectId,
    ),
    get_keyword_metrics: adaptMcpTool(getKeywordMetricsTool, extra, projectId),
    get_search_console_performance: adaptMcpTool(
      getSearchConsolePerformanceTool,
      extra,
      projectId,
    ),
    inspect_urls: adaptMcpTool(inspectUrlsTool, extra, projectId),
  };
}
