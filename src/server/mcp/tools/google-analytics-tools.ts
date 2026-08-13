/* eslint-disable max-lines -- all GA4 MCP tools are intentionally kept in one module */
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Ga4MeasurementHealthService } from "@/server/features/ga4/services/Ga4MeasurementHealthService";
import { Ga4OrganicOverviewService } from "@/server/features/ga4/services/Ga4OrganicOverviewService";
import {
  GscApiError,
  GscNotConnectedError,
  GscTokenError,
} from "@/server/lib/gscErrors";
import {
  Ga4ReportingService,
  type Ga4ReportInput,
} from "@/server/features/ga4/services/Ga4ReportingService";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Inclusive YYYY-MM-DD date. Provide both startDate and endDate.");

const commonAnalyticsInputSchema = {
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(1_000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
} as const;

const errorDetailSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().nullable().optional(),
    actionUrl: z.string().optional(),
  })
  .passthrough();

// The MCP SDK can only publish and validate a top-level object schema — a
// discriminated union normalizes to undefined, which drops the schema from
// tools/list and crashes output validation. So the ok/error branches share
// one object, with the per-status required fields enforced by a refinement.
function analyticsEnvelopeSchema(okShape: Record<string, z.ZodType>) {
  const requiredOkFields = Object.entries(okShape)
    .filter(([, field]) => !field.safeParse(undefined).success)
    .map(([key]) => key);
  const optionalShape = Object.fromEntries(
    Object.entries(okShape).map(([key, field]) => [key, field.optional()]),
  );
  return z
    .object({
      status: z.enum(["ok", "error"]),
      ...optionalShape,
      error: errorDetailSchema.optional(),
    })
    .passthrough()
    .superRefine((value, ctx) => {
      if (value.status === "error") {
        if (value.error === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["error"],
            message: "error is required when status is error",
          });
        }
        return;
      }
      for (const key of requiredOkFields) {
        if ((value as Record<string, unknown>)[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when status is ok`,
          });
        }
      }
    });
}

const reportOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  rowCount: z.number(),
  totalRowCount: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  pageInfo: looseObjectOutputSchema,
  reportMetadata: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  quota: looseObjectOutputSchema.nullable().optional(),
  comparison: looseObjectOutputSchema.optional(),
  ecommerceActivity: looseObjectOutputSchema.optional(),
  siteSearchActivity: looseObjectOutputSchema.optional(),
  diagnostics: z.array(looseObjectOutputSchema).optional(),
  diagnosticCoverage: looseObjectOutputSchema.optional(),
});

const overviewOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  current: looseObjectOutputSchema.nullable(),
  previous: looseObjectOutputSchema.nullable(),
  comparison: looseObjectOutputSchema,
  trend: z.array(z.record(z.string(), z.unknown())),
  diagnostics: z.array(looseObjectOutputSchema),
  reportMetadata: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  quota: looseObjectOutputSchema.nullable().optional(),
});

const measurementHealthOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  summary: looseObjectOutputSchema,
  issues: z.array(z.string()),
  webStreams: z.array(z.record(z.string(), z.unknown())),
  otherStreams: z.array(z.record(z.string(), z.unknown())),
  keyEvents: z.array(z.record(z.string(), z.unknown())),
  customDefinitions: looseObjectOutputSchema,
});

const opportunityOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  rowCount: z.number(),
  totalCandidateRows: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  scoring: looseObjectOutputSchema,
  coverage: looseObjectOutputSchema,
  truncated: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  reportMetadata: looseObjectOutputSchema,
  quota: looseObjectOutputSchema.nullable().optional(),
});

type ProjectContext = {
  auth: { organizationId: string };
  baseUrl: string;
  project: unknown;
};

type ProjectArgs = { projectId: string };

function actionUrl(
  baseUrl: string,
  projectId: string,
  code: string,
): string | undefined {
  if (code.startsWith("ga4_")) {
    if (
      [
        "ga4_not_connected",
        "ga4_reconnect_required",
        "ga4_property_inaccessible",
      ].includes(code)
    ) {
      return buildDashboardUrl(baseUrl, `/p/${projectId}/settings`);
    }
    return undefined;
  }
  if (code.startsWith("gsc_")) {
    return buildDashboardUrl(baseUrl, `/p/${projectId}/search-performance`);
  }
  return undefined;
}

function errorResponse(
  args: ProjectArgs,
  context: ProjectContext,
  error: unknown,
): CallToolResult {
  let code: string;
  let message: string;
  let retryAfterSeconds: number | null | undefined;
  if (error instanceof Ga4ReportError) {
    code = error.code;
    message = error.message;
    retryAfterSeconds = error.retryAfterSeconds;
  } else if (error instanceof GscNotConnectedError) {
    code = "gsc_not_connected";
    message = "Search Console is not connected for this project.";
  } else if (
    error instanceof GscTokenError ||
    (error instanceof GscApiError && [401, 403].includes(error.status))
  ) {
    code = "gsc_reconnect_required";
    message = "The Search Console connection has expired or was revoked.";
  } else if (error instanceof GscApiError) {
    code = "gsc_upstream_unavailable";
    message = "Search Console reporting is temporarily unavailable.";
  } else {
    throw error;
  }
  const url = actionUrl(context.baseUrl, args.projectId, code);
  return mcpResponse({
    text: `${message}${url ? ` Continue here: ${url}` : ""}`,
    meta: buildProjectMeta(context, args.projectId),
    structuredContent: {
      status: "error",
      error: {
        code,
        message,
        retryAfterSeconds,
        actionUrl: url,
      },
    },
  });
}

function reportText(
  label: string,
  result: Awaited<ReturnType<typeof Ga4ReportingService.runReport>>,
) {
  const range = result.request.resolvedDateRange;
  const comparison = result.comparison
    ? ` Previous-period comparison returned ${result.comparison.rows.length} row(s).`
    : "";
  const diagnostics =
    result.diagnostics.length > 0
      ? ` ${result.diagnostics.length} diagnostic finding(s) are included.`
      : "";
  return `${label}: ${result.rowCount} of ${result.totalRowCount} rows for ${range.startDate} through ${range.endDate}.${comparison}${diagnostics}${result.reportMetadata.hasLimitedData ? " Google marked this report as limited; inspect reportMetadata." : ""}`;
}

function createAnalyticsReportHandler<TArgs extends ProjectArgs>(
  label: string,
  toInput: (args: TArgs) => Ga4ReportInput,
) {
  return withMcpProjectAuth(async (args: TArgs, context) => {
    try {
      const result = await Ga4ReportingService.runReport(toInput(args));
      return mcpResponse({
        text: reportText(label, result),
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  });
}

const landingPageInputSchema = z.strictObject(commonAnalyticsInputSchema);
type LandingPageArgs = z.infer<typeof landingPageInputSchema>;

export const getGoogleAnalyticsOrganicLandingPagesTool = {
  name: "get_google_analytics_organic_landing_pages",
  config: {
    title: "Get Google Analytics organic landing pages",
    description:
      "Read organic-search landing page sessions, engagement, key events, transactions, and revenue from the project's connected GA4 property. Defaults to the last 28 complete property days. Read-only and uses no OpenSEO credits.",
    inputSchema: landingPageInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<LandingPageArgs>(
    "Organic landing pages",
    (args) => ({
      ...args,
      kind: "landing_pages",
      channel: "organic_search",
    }),
  ),
};

const pagePerformanceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  includeDate: z.boolean().optional().default(false),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
});
type PagePerformanceArgs = z.infer<typeof pagePerformanceInputSchema>;

export const getGoogleAnalyticsPagePerformanceTool = {
  name: "get_google_analytics_page_performance",
  config: {
    title: "Get Google Analytics page performance",
    description:
      "Read page views, users, engagement duration, and key events from the connected GA4 property. Organic Search is the default; set channel to all to include every channel. Read-only and uses no OpenSEO credits.",
    inputSchema: pagePerformanceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<PagePerformanceArgs>(
    "Page performance",
    (args) => ({
      ...args,
      kind: "page_performance",
    }),
  ),
};

const keyEventsInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["event", "event_and_landing_page"])
    .optional()
    .default("event"),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type KeyEventsArgs = z.infer<typeof keyEventsInputSchema>;

export const getGoogleAnalyticsKeyEventsTool = {
  name: "get_google_analytics_key_events",
  config: {
    title: "Get Google Analytics key events",
    description:
      "Read active GA4 key events with counts and users by event or organic landing page. Previous-period comparison is available for the event breakdown. Read-only and uses no OpenSEO credits.",
    inputSchema: keyEventsInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<KeyEventsArgs>(
    "Key events",
    (args) => ({
      ...args,
      kind: "key_events",
    }),
  ),
};

const opportunityInputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
type OpportunityArgs = z.infer<typeof opportunityInputSchema>;

export const getSearchOpportunitiesTool = {
  name: "get_search_opportunities",
  config: {
    title: "Get search opportunities",
    description:
      "Join Search Console pages ranking in positions 4–20 with GA4 organic landing-page outcomes, then score matched opportunities by demand, business value, and reachability. Unmatched pages remain visible and unscored. Read-only and uses no OpenSEO credits.",
    inputSchema: opportunityInputSchema,
    outputSchema: opportunityOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: OpportunityArgs, context) => {
    try {
      const result = await SearchOpportunityService.getOpportunities(args);
      return mcpResponse({
        text: `Search opportunities: ${result.rowCount} returned from ${result.totalCandidateRows} candidates. ${result.coverage.matchedRows} candidates matched GA4 landing pages.`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

const overviewInputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  trend: z.enum(["daily", "weekly"]).optional().default("daily"),
});
type OverviewArgs = z.infer<typeof overviewInputSchema>;

export const getGoogleAnalyticsOrganicOverviewTool = {
  name: "get_google_analytics_organic_overview",
  config: {
    title: "Get Google Analytics organic overview",
    description:
      "Answer whether organic traffic is improving with top-line sessions, users, engagement, key events, transactions, revenue, an equal-length previous-period comparison, and a daily or weekly trend. Read-only and uses no OpenSEO credits.",
    inputSchema: overviewInputSchema,
    outputSchema: overviewOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: OverviewArgs, context) => {
    try {
      const result = await Ga4OrganicOverviewService.getOrganicOverview(args);
      return mcpResponse({
        text: `Organic overview for ${result.request.resolvedDateRange.startDate} through ${result.request.resolvedDateRange.endDate}, compared with ${result.request.previousDateRange.startDate} through ${result.request.previousDateRange.endDate}.`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

const trafficAcquisitionInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["channel_group", "source_medium", "campaign"])
    .optional()
    .default("channel_group"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type TrafficAcquisitionArgs = z.infer<typeof trafficAcquisitionInputSchema>;

export const getGoogleAnalyticsTrafficAcquisitionTool = {
  name: "get_google_analytics_traffic_acquisition",
  config: {
    title: "Get Google Analytics traffic acquisition",
    description:
      "Compare session acquisition by channel group, source/medium, or campaign, including sessions, users, engagement, key events, transactions, and revenue. Previous-period comparison is available for channel group; source/medium also reports attribution-quality diagnostics. Read-only and uses no OpenSEO credits.",
    inputSchema: trafficAcquisitionInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<TrafficAcquisitionArgs>(
    "Traffic acquisition",
    (args) => ({
      ...args,
      kind: "traffic_acquisition",
      channel: "all",
      acquisitionBreakdown: args.breakdown,
      breakdown: undefined,
    }),
  ),
};

const ecommerceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z.enum(["item", "landing_page"]).optional().default("item"),
  onlyWithTransactions: z.boolean().optional().default(false),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
});
type EcommerceArgs = z.infer<typeof ecommerceInputSchema>;

export const getGoogleAnalyticsEcommercePerformanceTool = {
  name: "get_google_analytics_ecommerce_performance",
  config: {
    title: "Get Google Analytics ecommerce performance",
    description:
      "Read item views, add-to-cart units, purchases, and item revenue by item, or transactions and purchase revenue by landing page. Returns a detected, none, or unknown activity state; landing pages can be limited to those with transactions. Organic Search is the default. Read-only and uses no OpenSEO credits.",
    inputSchema: ecommerceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<EcommerceArgs>(
    "Ecommerce performance",
    (args) => ({
      ...args,
      kind: "ecommerce_performance",
      ecommerceBreakdown: args.breakdown,
      ecommerceOnlyWithTransactions: args.onlyWithTransactions,
      breakdown: undefined,
    }),
  ),
};

const siteSearchInputSchema = z.strictObject(commonAnalyticsInputSchema);
type SiteSearchArgs = z.infer<typeof siteSearchInputSchema>;

export const getGoogleAnalyticsSiteSearchTool = {
  name: "get_google_analytics_site_search",
  config: {
    title: "Get Google Analytics site search",
    description:
      "Read measured internal search terms with search events, users, sessions, engaged sessions, and engagement rate. Requires GA4 site-search measurement. Read-only and uses no OpenSEO credits.",
    inputSchema: siteSearchInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<SiteSearchArgs>(
    "Site search",
    (args) => ({
      ...args,
      kind: "site_search",
      channel: "all",
    }),
  ),
};

const audienceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["device", "country", "new_vs_returning"])
    .optional()
    .default("device"),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type AudienceArgs = z.infer<typeof audienceInputSchema>;

export const getGoogleAnalyticsAudienceBreakdownTool = {
  name: "get_google_analytics_audience_breakdown",
  config: {
    title: "Get Google Analytics audience breakdown",
    description:
      "Read device, country, or new-versus-returning users, sessions, engagement, and key events. Previous-period comparison is available for device and new-versus-returning breakdowns. No demographic or user-level dimensions. Read-only and uses no OpenSEO credits.",
    inputSchema: audienceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<AudienceArgs>(
    "Audience breakdown",
    (args) => ({
      ...args,
      kind: "audience_breakdown",
      audienceBreakdown: args.breakdown,
      breakdown: undefined,
    }),
  ),
};

const measurementHealthInputSchema = z.strictObject({
  projectId: projectIdSchema,
});
type MeasurementHealthArgs = z.infer<typeof measurementHealthInputSchema>;

export const getGoogleAnalyticsMeasurementHealthTool = {
  name: "get_google_analytics_measurement_health",
  config: {
    title: "Get Google Analytics measurement health",
    description:
      "Diagnose the connected property's data streams, web measurement IDs, enhanced-measurement settings, key events, and custom definitions. Read-only and uses no OpenSEO credits.",
    inputSchema: measurementHealthInputSchema,
    outputSchema: measurementHealthOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: MeasurementHealthArgs, context) => {
    try {
      const result = await Ga4MeasurementHealthService.getMeasurementHealth(
        args.projectId,
      );
      return mcpResponse({
        text: `Measurement health: ${result.summary.webStreamCount} web stream(s), ${result.summary.keyEventCount} key event(s), and ${result.summary.issueCount} diagnostic issue(s).`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};
