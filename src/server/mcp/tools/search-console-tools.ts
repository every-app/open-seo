/* eslint-disable max-lines */
import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  GscNotConnectedError,
  GscService,
} from "@/server/features/gsc/services/GscService";
import {
  GSC_DATE_RANGES,
  GSC_DEFAULT_ROW_LIMIT,
  GSC_DIMENSIONS,
  GSC_FILTER_OPERATORS,
  GSC_MAX_ROW_LIMIT,
  GSC_SEARCH_TYPES,
  type GscPerformanceInput,
} from "@/server/features/gsc/searchAnalytics";
import { GscApiError, GscTokenError } from "@/server/lib/gscClient";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";

const TEXT_SUMMARY_ROWS = 15;

type ProjectAuthContext = {
  auth: { organizationId: string };
  baseUrl: string;
};

function integrationsUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/integrations`);
}

/** Self-hosted GSC requires the operator to provide a Google OAuth client and
 *  BETTER_AUTH_SECRET. Hosted mode always has both; self-hosted tools return this
 *  setup nudge before attempting a token lookup when either is missing. */
async function missingSelfHostedGoogleClientResponse(
  context: ProjectAuthContext,
  projectId: string,
) {
  const [hosted, configured] = await Promise.all([
    isHostedServerAuthMode(),
    hasSelfHostedGscConfig(),
  ]);
  if (hosted || configured) return null;

  return mcpResponse({
    text: `This self-hosted OpenSEO deployment is not configured for Search Console yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET, then reconnect Search Console from Integrations. Setup docs: ${GSC_SELF_HOSTED_SETUP_DOCS_URL}`,
    meta: buildProjectMeta(context, projectId),
    structuredContent: {
      ok: false,
      connected: false,
      reason: "gsc_oauth_not_configured",
      setupDocsUrl: GSC_SELF_HOSTED_SETUP_DOCS_URL,
    },
  });
}

function invalidRequest(
  meta: ReturnType<typeof buildProjectMeta>,
  message: string,
) {
  return mcpResponse({
    text: message,
    meta,
    structuredContent: { ok: false, reason: "invalid_request" },
  });
}

function describeGscError(error: unknown): string {
  if (error instanceof GscNotConnectedError) {
    return "Search Console is not connected for this project.";
  }
  if (error instanceof GscTokenError) {
    return "The Search Console connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof GscApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// get_search_console_performance
// ---------------------------------------------------------------------------

const filterSchema = z.object({
  dimension: z.enum(GSC_DIMENSIONS),
  operator: z.enum(GSC_FILTER_OPERATORS).default("equals"),
  expression: z.string().min(1),
});

const perfInputSchema = {
  projectId: projectIdSchema,
  dimensions: z
    .array(z.enum(GSC_DIMENSIONS))
    .min(1)
    .max(4)
    .optional()
    .describe(
      "Group rows by these dimensions. Default ['query']. Use ['page'] for top pages, ['query','page'] to map queries to pages / spot cannibalization, ['date'] for a time series.",
    ),
  dateRange: z
    .enum(GSC_DATE_RANGES)
    .optional()
    .describe(
      "Convenience window (default last_28_days). End is set ~3 days back for GSC data lag. Ignored if startDate+endDate are given. Max lookback is 16 months.",
    ),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit start (YYYY-MM-DD, Pacific Time). Use with endDate."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit end (YYYY-MM-DD, Pacific Time). Use with startDate."),
  filters: z
    .array(filterSchema)
    .max(5)
    .optional()
    .describe(
      "AND-combined filters. To get the queries for one page: [{dimension:'page',operator:'equals',expression:'https://example.com/post'}] with dimensions ['query'].",
    ),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(GSC_MAX_ROW_LIMIT)
    .optional()
    .describe(
      "Rows per call (default 1000, max 1000). GSC sorts by clicks desc and can't filter by position — filter 'striking distance' positions client-side, and paginate with startRow when hasMore is true.",
    ),
  startRow: z.number().int().min(0).optional().describe("Pagination offset."),
  type: z
    .enum(GSC_SEARCH_TYPES)
    .optional()
    .describe("Search type (default web)."),
  dataState: z
    .enum(["all", "final"])
    .optional()
    .describe("'all' (default) includes fresh/incomplete recent data."),
} as const;

type PerfArgs = z.infer<z.ZodObject<typeof perfInputSchema>>;

export const getSearchConsolePerformanceTool = {
  name: "get_search_console_performance",
  config: {
    title: "Get Google Search Console performance",
    description:
      "Query the connected Search Console property's Search Analytics: clicks, impressions, CTR, and average position by query/page/country/device/date. First-party data — use it for what already ranks, near-ranking queries, and pages with real demand. ctr is a 0-1 fraction; position is a 1-based average; dates are Pacific Time; the last ~3 days may be incomplete. Read-only and free (no credits).",
    inputSchema: perfInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dimensions: z.array(z.string()).optional(),
      rowCount: z.number().optional(),
      rows: z
        .array(
          z
            .object({
              keys: z.array(z.string()).optional(),
              clicks: z.number(),
              impressions: z.number(),
              ctr: z.number(),
              position: z.number(),
            })
            .passthrough(),
        )
        .optional(),
      hasMore: z.boolean().optional(),
      nextStartRow: z.number().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PerfArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = integrationsUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/integrations`,
    );

    // GSC rejects searchAppearance combined with any other dimension.
    if (
      args.dimensions &&
      args.dimensions.includes("searchAppearance") &&
      args.dimensions.length > 1
    ) {
      return invalidRequest(
        meta,
        "searchAppearance must be the only dimension when used.",
      );
    }
    // A half-specified explicit range would silently fall back to a default window.
    if (Boolean(args.startDate) !== Boolean(args.endDate)) {
      return invalidRequest(
        meta,
        "Provide both startDate and endDate, or neither (use dateRange instead).",
      );
    }

    try {
      const result = await GscService.getPerformance(
        args satisfies GscPerformanceInput,
      );
      const dimensions = result.request.dimensions ?? ["query"];
      // rowLimit is clamped to the agent cap in buildSearchAnalyticsRequest, so
      // result.rows is already <= the cap — every count below reflects what we return.
      const rows = result.rows;
      const requestedLimit = result.request.rowLimit ?? GSC_DEFAULT_ROW_LIMIT;
      const hasMore = rows.length >= requestedLimit;
      const nextStartRow = (result.request.startRow ?? 0) + rows.length;

      const summaryLines = rows.slice(0, TEXT_SUMMARY_ROWS).map((r) => {
        const label = r.keys?.join(" / ") ?? "(total)";
        const ctrPct = (r.ctr * 100).toFixed(1);
        return `  ${label} — ${r.clicks} clicks, ${r.impressions} impr, ${ctrPct}% CTR, pos ${r.position.toFixed(1)}`;
      });
      const header =
        `${result.siteUrl} · ${dimensions.join("+")} · ${result.request.startDate}→${result.request.endDate} · ` +
        `${rows.length} row${rows.length === 1 ? "" : "s"}${hasMore ? " (more available — paginate with startRow)" : ""}`;
      const text =
        summaryLines.length > 0
          ? `${header}\n${summaryLines.join("\n")}${rows.length > summaryLines.length ? `\n  …and ${rows.length - summaryLines.length} more` : ""}`
          : `${header}\nNo rows for this query/date range.`;

      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          siteUrl: result.siteUrl,
          startDate: result.request.startDate,
          endDate: result.request.endDate,
          dimensions,
          rowCount: rows.length,
          rows,
          hasMore,
          nextStartRow: hasMore ? nextStartRow : undefined,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof GscNotConnectedError;
      return mcpResponse({
        text: `${describeGscError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
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

// ---------------------------------------------------------------------------
// inspect_urls
// ---------------------------------------------------------------------------

const inspectInputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().url())
    .min(1)
    .max(10)
    .describe(
      "1–10 absolute URLs to inspect. Each must belong to the connected property.",
    ),
  languageCode: z
    .string()
    .optional()
    .describe("BCP-47 language for the inspection result (e.g. 'en-US')."),
} as const;

type InspectArgs = z.infer<z.ZodObject<typeof inspectInputSchema>>;

export const inspectUrlsTool = {
  name: "inspect_urls",
  config: {
    title: "Inspect URLs in Google Search Console",
    description:
      "Run Google Search Console's URL Inspection on up to 10 URLs of the connected property: index/coverage state, last crawl time, Google-selected vs declared canonical, and mobile/rich-results verdicts. Use it to answer 'is this page indexed? why not?'. Per-URL failures are reported inline. Read-only and free (no credits).",
    inputSchema: inspectInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      results: z
        .array(
          z
            .object({
              url: z.string(),
              result: z.unknown().nullable().optional(),
              error: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: InspectArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = integrationsUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/integrations`,
    );

    try {
      const { siteUrl, results } = await GscService.inspectUrls({
        projectId: args.projectId,
        urls: args.urls,
        languageCode: args.languageCode,
      });

      const summaryLines = results.slice(0, TEXT_SUMMARY_ROWS).map((r) => {
        if (r.error) return `  ${r.url} — error: ${r.error}`;
        const index = r.result?.indexStatusResult;
        const verdict = index?.verdict ?? "UNKNOWN";
        const coverage = index?.coverageState ?? "—";
        const canonical = index?.googleCanonical
          ? `, google-canonical ${index.googleCanonical}`
          : "";
        return `  ${r.url} — ${verdict}: ${coverage}${canonical}`;
      });
      const text =
        `${siteUrl} · inspected ${results.length} URL${results.length === 1 ? "" : "s"}\n` +
        summaryLines.join("\n");

      return mcpResponse({
        text,
        meta,
        structuredContent: { ok: true, siteUrl, results },
      });
    } catch (error) {
      const isNotConnected = error instanceof GscNotConnectedError;
      return mcpResponse({
        text: `${describeGscError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
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
