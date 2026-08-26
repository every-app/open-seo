import { tool, type Tool, type ToolSet } from "ai";
import { z, type ZodRawShape } from "zod";
import { withPgClient } from "@/db";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { type ToolAuthContext, type ToolContext } from "@/server/mcp/context";
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
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import { buildUpdateProjectContextTool } from "@/server/mcp/tools/project-context";
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
import {
  findSerpCompetitorsTool,
  getGoogleBusinessQuestionsTool,
  getKeywordMetricsTool,
  getLocalSerpResultsTool,
  getRankedKeywordsTool,
  searchLocalBusinessesTool,
} from "@/server/mcp/tools/dataforseo-research-tools";
import {
  getBusinessProfileTool,
  getBusinessReviewsTool,
  getBusinessUpdatesTool,
  getLocalRankGridTool,
  listBusinessCategoriesTool,
} from "@/server/mcp/tools/local-seo-tools";
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
  name: string;
  config: { description: string; inputSchema: Shape };
  handler: (
    args: z.infer<z.ZodObject<Shape>>,
    context: ToolContext,
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

// Adapt one OpenSEO tool into an AI SDK tool. The shared handler receives the
// same explicit auth context as the MCP transport, and runs through the same
// instrumentation wrapper, so project scoping, credit metering, and the
// mcp:tool_call telemetry (source "in_app_agent", null clientId) all match the
// external MCP path.
//
// SAM always runs inside one project (the session row), so we bind that project
// server-side: any tool with a `projectId` input has it stripped from the schema
// the model sees and injected at call time. The model never has to know or pass
// the id, can't target another project, and can't hallucinate a wrong one.
function adaptMcpTool<Shape extends ZodRawShape>(
  def: McpToolDefinition<Shape>,
  context: ToolContext,
  projectId: string,
): Tool {
  const { projectId: _projectIdSchema, ...modelShape } = def.config.inputSchema;
  const bindsProject = "projectId" in def.config.inputSchema;
  const handler = instrumentMcpToolHandler(def.name, undefined, def.handler);

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
          await withPgClient(() => handler(fullArgs, context)),
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

// Audits run for minutes, and a chat model cannot sleep — given an instant
// status tool it spin-polls, and every call plus its result is persisted into
// the session history. SAM's get_audit_status therefore waits server-side:
// while the audit is running, it re-reads every few seconds and returns as
// soon as the status line changes (or when the budget runs out), so one tool
// call buys ~a minute of quiet waiting. The sleep sits BETWEEN adapted calls,
// so each re-read scopes its own short-lived DB client rather than holding one
// through the wait; each re-read also emits its own mcp:tool_call event, so
// telemetry counts server polls, not model calls.
const AUDIT_STATUS_POLL_MS = 2_000;
const AUDIT_STATUS_WAIT_BUDGET_MS = 50_000;

// The adapted tool returns toModelOutput's { summary, data } flattening; the
// summary line carries phase + page counts, so a changed line IS progress.
const auditProgressLine = (result: unknown): string | null =>
  typeof result === "object" &&
  result !== null &&
  "summary" in result &&
  typeof result.summary === "string"
    ? result.summary
    : null;

const auditIsRunning = (result: unknown): boolean => {
  if (typeof result !== "object" || result === null || !("data" in result)) {
    return false;
  }
  const data = result.data;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    return false;
  }
  const status = data.status;
  return (
    typeof status === "object" &&
    status !== null &&
    "status" in status &&
    status.status === "running"
  );
};

export function waitingAuditStatusTool(
  adapt: (
    definition: McpToolDefinition<typeof getAuditStatusTool.config.inputSchema>,
  ) => Tool,
): Tool {
  const base = adapt({
    ...getAuditStatusTool,
    config: {
      ...getAuditStatusTool.config,
      description: `${getAuditStatusTool.config.description} While the audit is running this call waits up to ~1 minute server-side and returns as soon as progress changes, so never call it in a tight loop: check a few times, narrating progress to the user in between, and if it is still running after that, say so and let the user come back for the results.`,
    },
  });
  const baseExecute = base.execute;
  if (!baseExecute) return base;

  return {
    ...base,
    execute: async (args, options) => {
      const deadline = Date.now() + AUDIT_STATUS_WAIT_BUDGET_MS;
      let result: unknown = await baseExecute(args, options);
      const initial = auditProgressLine(result);
      while (
        auditIsRunning(result) &&
        auditProgressLine(result) === initial &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, AUDIT_STATUS_POLL_MS),
        );
        result = await baseExecute(args, options);
      }
      return result;
    },
  };
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
 * available except the ones a project-bound chat can't use (list_projects,
 * create_project) and get_project_context (already a context block). Auth and
 * billing context are passed directly to the shared tool handlers. DataForSEO
 * spend is metered inside the shared client, so tool calls draw down the org's
 * credits automatically.
 *
 * When the MCP server gains a tool, add it here too — this list drifted for six
 * weeks once (audit + GA4 + rank-tracker management were MCP-only) before
 * anyone noticed.
 */
export function buildSamMcpTools(
  authContext: ToolAuthContext,
  project: { id: string; domain: string | null },
): ToolSet {
  const projectId = project.id;
  const toolContext: ToolContext = { auth: authContext };
  const adaptTool = <Shape extends ZodRawShape>(
    definition: McpToolDefinition<Shape>,
  ) => adaptMcpTool(definition, toolContext, projectId);

  // The GA4 tools define inputSchema as a built ZodObject instead of a raw
  // shape; unwrap it so the same adapter (projectId stripping included) applies.
  type AnyMcpHandler = McpToolDefinition<ZodRawShape>["handler"];
  const adaptObjectTool = (definition: {
    name: string;
    config: { description: string; inputSchema: { shape: ZodRawShape } };
    handler: (args: never, context: ToolContext) => Promise<CallToolResult>;
  }) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same arg shape; the adapter rebuilds z.object from the unwrapped shape before calling it
    const handler = definition.handler as AnyMcpHandler;
    return adaptMcpTool(
      {
        name: definition.name,
        config: {
          description: definition.config.description,
          inputSchema: definition.config.inputSchema.shape,
        },
        handler,
      },
      toolContext,
      projectId,
    );
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
    whoami: adaptTool(whoamiTool),
    // Writes only: the project's memory is already injected into every turn as
    // a read-only context block, so get_project_context would just re-fetch it.
    update_project_context: adaptTool(buildUpdateProjectContextTool("sam")),
    list_saved_keywords: adaptTool(listSavedKeywordsTool),
    research_keywords: adaptTool(researchKeywordsTool),
    save_keywords: adaptTool(saveKeywordsTool),
    get_domain_overview: adaptTool(getDomainOverviewTool),
    get_domain_keyword_suggestions: adaptTool(getDomainKeywordSuggestionsTool),
    get_backlinks_overview: adaptTool(getBacklinksOverviewTool),
    get_backlinks_profile: adaptTool(getBacklinksProfileTool),
    get_serp_results: adaptTool(getSerpResultsTool),
    create_rank_tracker: adaptTool(createRankTrackerTool),
    get_rank_tracker: adaptTool(getRankTrackerTool),
    add_rank_tracking_keywords: adaptTool(addRankTrackingKeywordsTool),
    remove_rank_tracking_keywords: adaptTool(removeRankTrackingKeywordsTool),
    estimate_rank_tracker_cost: adaptTool(estimateRankTrackerCostTool),
    run_rank_tracker: adaptTool(runRankTrackerTool),
    get_ranked_keywords: adaptTool(getRankedKeywordsTool),
    find_serp_competitors: adaptTool(findSerpCompetitorsTool),
    search_local_businesses: adaptTool(searchLocalBusinessesTool),
    get_local_serp_results: adaptTool(getLocalSerpResultsTool),
    get_google_business_questions: adaptTool(getGoogleBusinessQuestionsTool),
    get_business_profile: adaptTool(getBusinessProfileTool),
    get_business_reviews: adaptTool(getBusinessReviewsTool),
    get_business_updates: adaptTool(getBusinessUpdatesTool),
    list_business_categories: adaptTool(listBusinessCategoriesTool),
    get_local_rank_grid: adaptTool(getLocalRankGridTool),
    get_keyword_metrics: adaptTool(getKeywordMetricsTool),
    get_search_console_performance: adaptTool(getSearchConsolePerformanceTool),
    inspect_urls: adaptTool(inspectUrlsTool),
    // Unconditional like the MCP server's registrations — the GA4 launch gate
    // was removed in #505.
    get_google_analytics_organic_landing_pages: adaptObjectTool(
      getGoogleAnalyticsOrganicLandingPagesTool,
    ),
    get_google_analytics_page_performance: adaptObjectTool(
      getGoogleAnalyticsPagePerformanceTool,
    ),
    get_google_analytics_key_events: adaptObjectTool(
      getGoogleAnalyticsKeyEventsTool,
    ),
    get_search_opportunities: adaptObjectTool(getSearchOpportunitiesTool),
    get_google_analytics_organic_overview: adaptObjectTool(
      getGoogleAnalyticsOrganicOverviewTool,
    ),
    get_google_analytics_traffic_acquisition: adaptObjectTool(
      getGoogleAnalyticsTrafficAcquisitionTool,
    ),
    get_google_analytics_measurement_health: adaptObjectTool(
      getGoogleAnalyticsMeasurementHealthTool,
    ),
    get_google_analytics_ecommerce_performance: adaptObjectTool(
      getGoogleAnalyticsEcommercePerformanceTool,
    ),
    get_google_analytics_site_search: adaptObjectTool(
      getGoogleAnalyticsSiteSearchTool,
    ),
    get_google_analytics_audience_breakdown: adaptObjectTool(
      getGoogleAnalyticsAudienceBreakdownTool,
    ),
    run_site_audit: adaptTool(runSiteAuditTool),
    get_audit_status: waitingAuditStatusTool(adaptTool),
    get_audit_issues: adaptTool(getAuditIssuesTool),
    get_audit_pages: adaptTool(getAuditPagesTool),
  };
}
