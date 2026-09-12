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
import {
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import { whoamiTool } from "@/server/mcp/tools/whoami";
import { discoverSiteUrls, readPages, readSite } from "@/server/lib/scrape";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";
import { boundAgentGscOutput } from "@/server/features/sam/samGscBounding";
import {
  nullToolExecutionTracker,
  type ToolExecutionTracker,
} from "@/server/features/sam/samToolExecution";
import {
  createToolRecoveryState,
  type ToolRecoveryState,
} from "@/server/features/sam/samToolRecovery";
import { executeAdaptedTool } from "@/server/features/sam/samGuardedToolExecute";
import {
  buildPollSiteAuditTool,
  type PollCoordinator,
  tagStartedAudit,
} from "@/server/features/sam/samLongRunningTools";
import type { PollConfig } from "@/server/features/sam/samTurnControls";

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
    extra: ToolExtra,
  ) => Promise<CallToolResult>;
};

// Adapt one MCP tool into an AI SDK tool. The MCP handler reads auth from `extra`
// (via requireMcpToolAuthContext) and self-gates project access against the org,
// so SAM gets identical scoping and metering for free.
//
// SAM always runs inside one project (the session row), so we bind that project
// server-side: any tool with a `projectId` input has it stripped from the schema
// the model sees and injected at call time. The model never has to know or pass
// the id, can't target another project, and can't hallucinate a wrong one.
//
// The tracker dedups identical calls within the conversation (the model can
// re-request the same tool call after a stall/retry) and logs every execution;
// a null/no-op tracker keeps non-SAM callers unaffected.
// Tools whose output must never be served from the dedup cache: they are
// progress reads over mutable workflow state, and a cached "running" snapshot
// would make every repeat poll return the same stale result until the DO is
// evicted (the failure mode that motivated Phase P). The reads are cheap D1
// lookups, so skipping the cache costs nothing.
const FRESH_READ_TOOLS = new Set(["get_audit_status"]);

type AdaptMcpToolContext = {
  extra: ToolExtra;
  projectId: string;
  tracker: ToolExecutionTracker;
  sessionId: string;
  /** Per-turn failure state — blocks repeat calls to known-unavailable tools. */
  recovery: ToolRecoveryState;
  /** Bounded wait before the single automatic retry (injectable for tests). */
  sleep: (ms: number) => Promise<void>;
};

type AdaptMcpToolOptions = {
  description?: string;
  postProcess?: (output: unknown) => unknown;
};

function adaptMcpTool<Shape extends ZodRawShape>(
  def: McpToolDefinition<Shape>,
  ctx: AdaptMcpToolContext,
  opts?: AdaptMcpToolOptions,
): Tool {
  const { extra, projectId } = ctx;
  const { projectId: _projectIdSchema, ...modelShape } = def.config.inputSchema;
  const bindsProject = "projectId" in def.config.inputSchema;

  return tool({
    description: opts?.description ?? def.config.description,
    inputSchema: z.object(bindsProject ? modelShape : def.config.inputSchema),
    execute: async (args) => {
      // Reconstruct the handler's validated arg shape by injecting the session
      // projectId that we stripped from the model-facing schema above.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- projectId re-added to rebuild the tool's Shape; the handler re-validates project access
      const fullArgs = (bindsProject
        ? { ...args, projectId }
        : args) as unknown as z.infer<z.ZodObject<Shape>>;
      // Tool calls run inside Think's inference loop, outside any ambient
      // request scope, so each execution scopes its own Postgres client
      // (no-op in D1 mode) — same rule as the DO's other DB-touching seams.
      // Duplicate-call protection, the single bounded retry, and the curated
      // failure signals live in the shared guarded runner (samToolRecovery).
      return executeAdaptedTool({
        toolName: def.name,
        fullArgs,
        ctx,
        run: () => withPgClient(() => def.handler(fullArgs, extra)),
        postProcess: opts?.postProcess,
        cacheable: !FRESH_READ_TOOLS.has(def.name),
      });
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
              "This project has no website set â€” ask the user for their site first.",
          };
        }
        const result = await discoverSiteUrls(target, SAM_MAX_MAPPED_URLS);
        return result.blocked
          ? { blocked: true, urls: [], note: "Could not reach the site." }
          : { blocked: false, urls: result.urls };
      },
    }),
    read_pages: tool({
      description: `Read up to ${SAM_MAX_SCRAPE_PAGES} web pages as plain text â€” the project's own pages or anyone else's (competitors, references). Pass specific \`urls\` (usually picked from map_links); omit to read a representative sample of the project's own site. Uses no credits.`,
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
              "This project has no website set â€” ask the user for their site, or pass explicit urls.",
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
 * free site-reading tools and the audit poll orchestrator. Every tool the
 * OpenSEO MCP server exposes is available; auth/billing context is carried on
 * a synthetic `ToolExtra` the handlers read exactly as they would on the real
 * MCP route. DataForSEO spend is metered inside the shared client, so tool
 * calls draw down the org's credits automatically.
 *
 * `tracker` (optional) enables per-conversation dedup + execution logging; pass
 * the result of `createToolExecutionTracker` from the DO, or nothing to keep
 * plain behavior.
 *
 * `options.poll` + `options.pollCoordinator` enable `poll_site_audit` — the
 * long-running-tool wait described in samLongRunningTools.ts. The coordinator
 * should come from the DO so single-flight/terminal memo survive across turns.
 */
export function buildSamMcpTools(
  authContext: McpToolAuthContext,
  project: { id: string; domain: string | null },
  tracker?: ToolExecutionTracker,
  options?: {
    poll?: PollConfig;
    pollCoordinator?: PollCoordinator;
    /** Per-turn failure state. Defaults to a fresh instance (= this turn). */
    recovery?: ToolRecoveryState;
    /** Bounded wait before the single automatic retry (tests inject instant). */
    sleep?: (ms: number) => Promise<void>;
  },
): ToolSet {
  const projectId = project.id;
  const sessionId = "sam";
  const toolTracker = tracker ?? nullToolExecutionTracker;
  const extra: ToolExtra = {
    // Placeholder to satisfy ToolExtra â€” no tool handler or the DataForSEO
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
  const adaptCtx: AdaptMcpToolContext = {
    extra,
    projectId,
    tracker: toolTracker,
    sessionId,
    // Fresh per build (= per turn: beforeTurn rebuilds the toolset every
    // turn), unless the caller injected a shared instance. Never survives
    // across turns — a tool blocked in turn A is retryable in turn B.
    recovery: options?.recovery ?? createToolRecoveryState(sessionId),
    sleep:
      options?.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const adapt = <Shape extends ZodRawShape>(
    def: McpToolDefinition<Shape>,
    opts?: AdaptMcpToolOptions,
  ): Tool => adaptMcpTool(def, adaptCtx, opts);

  // Note: no `list_projects`. SAM is bound to the session's project, so
  // discovering other projects isn't part of its job â€” every project-scoped tool
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
    whoami: adapt(whoamiTool),
    list_saved_keywords: adapt(listSavedKeywordsTool),
    research_keywords: adapt(researchKeywordsTool),
    save_keywords: adapt(saveKeywordsTool),
    get_domain_overview: adapt(getDomainOverviewTool),
    get_domain_keyword_suggestions: adapt(getDomainKeywordSuggestionsTool),
    get_backlinks_overview: adapt(getBacklinksOverviewTool),
    get_backlinks_profile: adapt(getBacklinksProfileTool),
    get_serp_results: adapt(getSerpResultsTool),
    get_rank_tracker: adapt(getRankTrackerTool),
    get_ranked_keywords: adapt(getRankedKeywordsTool),
    find_serp_competitors: adapt(findSerpCompetitorsTool),
    search_local_businesses: adapt(searchLocalBusinessesTool),
    get_local_serp_results: adapt(getLocalSerpResultsTool),
    get_google_business_questions: adapt(getGoogleBusinessQuestionsTool),
    get_keyword_metrics: adapt(getKeywordMetricsTool),
    get_search_console_performance: adapt(getSearchConsolePerformanceTool, {
      // The public MCP tool can return up to 1000 rows (the product contract);
      // in the agent transcript that is a multi-hundred-KB tool part the model
      // barely uses and the streaming client clones per chunk (the Phase T
      // render storm). Bound only the agent's copy — the MCP route is untouched.
      description:
        "Query the connected Search Console property's Search Analytics: clicks, impressions, CTR, and average position by query/page/country/device/date. First-party data — use it for what already ranks, near-ranking queries, and pages with real demand. ctr is a 0-1 fraction; position is a 1-based average. Read-only; uses no credits. Agent results are bounded to the top rows by clicks — the output note says how to fetch more (startRow / narrower filters).",
      postProcess: boundAgentGscOutput,
    }),
    inspect_urls: adapt(inspectUrlsTool),
    run_site_audit: adapt(runSiteAuditTool, {
      // SAM-specific orchestration guidance: the shared MCP description stays
      // untouched for external MCP clients; here it routes the model to the
      // poller instead of improvising a get_audit_status loop.
      description:
        "Start a site audit: crawls the site (robots.txt-aware, same-origin) and checks every page for SEO issues. Returns immediately with the audit id and state=started. If the user asked for audit RESULTS (page counts, issues), call poll_site_audit next and wait for a terminal state before answering — never report numbers from a partial crawl.",
      postProcess: tagStartedAudit,
    }),
    get_audit_status: adapt(getAuditStatusTool, {
      // One free snapshot. Waiting belongs in poll_site_audit so backoff,
      // timeout, and UI aggregation stay consistent.
      description:
        "Single snapshot of a site audit's current state (phase, pages crawled, Lighthouse progress). Free — reads OpenSEO state. To WAIT for completion, call poll_site_audit instead — it polls with backoff and returns a terminal state.",
    }),
    get_audit_issues: adapt(getAuditIssuesTool),
    get_audit_pages: adapt(getAuditPagesTool),
    ...(options?.poll && options.pollCoordinator
      ? {
          poll_site_audit: buildPollSiteAuditTool({
            projectId,
            extra,
            tracker: toolTracker,
            sessionId,
            coordinator: options.pollCoordinator,
            config: options.poll,
          }),
        }
      : {}),
  };
}
