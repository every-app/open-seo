/* eslint-disable max-lines -- Local Services MCP tools are intentionally kept in one module (search-console-tools precedent) */
import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { hasSelfHostedGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  DISSATISFIED_REASONS,
  LocalServicesReportingService,
  SATISFIED_REASONS,
  SURVEY_ANSWERS,
  type LocalServicesLead,
} from "@/server/features/google-ads/services/LocalServicesReportingService";
import { GoogleAdsReportError } from "@/server/lib/googleAdsErrors";
import { GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/google-ads";

const DEFAULT_LEAD_LIMIT = 50;
const MAX_LEAD_LIMIT = 200;

type ProjectAuthContext = {
  auth: { organizationId: string };
  baseUrl: string;
};

function connectGoogleAdsUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings/integrations`);
}

function formatMoney(
  microsValue: number | null,
  currencyCode: string | null,
): string {
  if (microsValue === null) return "—";
  const units = (microsValue / 1_000_000).toFixed(2);
  return currencyCode && currencyCode !== "USD"
    ? `${units} ${currencyCode}`
    : `$${units}`;
}

/** Self-hosted Google Ads needs the shared Google OAuth client plus a
 *  GOOGLE_ADS_DEVELOPER_TOKEN. The OAuth-client half mirrors the GSC/GA4
 *  nudge; the developer-token half surfaces through the service's
 *  google_ads_setup_required error. */
async function missingSelfHostedGoogleClientResponse(
  context: ProjectAuthContext,
  projectId: string,
) {
  const [hosted, configured] = await Promise.all([
    isHostedServerAuthMode(),
    hasSelfHostedGoogleOAuthConfig(),
  ]);
  if (hosted || configured) return null;

  return mcpResponse({
    text: `This self-hosted OpenSEO deployment is not configured for Google Ads yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET, then connect Google Ads from the project's settings page. Setup docs: ${GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL}`,
    meta: buildProjectMeta(context, projectId),
    structuredContent: {
      ok: false,
      connected: false,
      reason: "google_ads_oauth_not_configured",
      setupDocsUrl: GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL,
    },
  });
}

function reportErrorResponse(
  error: unknown,
  meta: ReturnType<typeof buildProjectMeta>,
  connectUrl: string,
) {
  if (!(error instanceof GoogleAdsReportError)) throw error;
  const guidance =
    error.code === "google_ads_not_connected"
      ? ` Connect it here: ${connectUrl}`
      : error.code === "google_ads_reconnect_required"
        ? ` Reconnect at ${connectUrl}`
        : error.code === "google_ads_access_pending"
          ? " This is expected while Google Ads API access (Basic Access) is still pending approval — no action needed in OpenSEO."
          : error.code === "google_ads_setup_required"
            ? ` Setup docs: ${GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL}`
            : "";
  return mcpResponse({
    text: `${error.message}${guidance}`,
    meta,
    structuredContent: {
      ok: false,
      reason: error.code,
      connectUrl,
    },
  });
}

// ---------------------------------------------------------------------------
// get_local_services_performance
// ---------------------------------------------------------------------------

const performanceInputSchema = {
  projectId: projectIdSchema,
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Explicit start (YYYY-MM-DD, account time zone). Default: last 28 days.",
    ),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit end (YYYY-MM-DD). Use with startDate."),
} as const;

type PerformanceArgs = z.infer<z.ZodObject<typeof performanceInputSchema>>;

export const getLocalServicesPerformanceTool = {
  name: "get_local_services_performance",
  config: {
    title: "Get Local Services Ads performance",
    description:
      "Report on the connected Google Ads account's Local Services Ads (LSA): spend, lead totals (charged/booked/by type), cost per charged lead, campaign budgets, and pacing of the last 7 days' spend against the weekly budget. Money fields are micros (1,000,000 = 1 currency unit). Read-only; uses no credits. LSA data comes from the Google Ads API and requires the Google Ads connection plus approved API access.",
    inputSchema: performanceInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      customerId: z.string().optional(),
      currencyCode: z.string().nullable().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      spendMicros: z.number().optional(),
      costPerChargedLeadMicros: z.number().nullable().optional(),
      leadTotals: z
        .looseObject({
          total: z.number(),
          charged: z.number(),
          booked: z.number(),
          phoneCalls: z.number(),
          messages: z.number(),
          bookings: z.number(),
          truncated: z.boolean(),
        })
        .optional(),
      pacing: z
        .looseObject({
          last7DaysSpendMicros: z.number(),
          weeklyBudgetMicros: z.number().nullable(),
          utilization: z.number().nullable(),
        })
        .optional(),
      campaigns: z
        .array(
          z
            .object({
              id: z.string(),
              name: z.string().nullable(),
              status: z.string().nullable(),
              budgetAmountMicros: z.number().nullable(),
              budgetPeriod: z.string().nullable(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PerformanceArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = connectGoogleAdsUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );
    if (Boolean(args.startDate) !== Boolean(args.endDate)) {
      return mcpResponse({
        text: "Provide both startDate and endDate, or neither.",
        meta,
        structuredContent: { ok: false, reason: "invalid_request" },
      });
    }

    try {
      const performance = await LocalServicesReportingService.getPerformance({
        projectId: args.projectId,
        startDate: args.startDate,
        endDate: args.endDate,
      });
      // Resolved by the service in the Ads account's time zone when the caller
      // didn't pin one.
      const range = performance.dateRange;
      const money = (value: number | null) =>
        formatMoney(value, performance.currencyCode);
      const { leadTotals, pacing } = performance;
      const utilization =
        pacing.utilization === null
          ? "n/a"
          : `${Math.round(pacing.utilization * 100)}%`;
      const lines = [
        `LSA · customer ${performance.customerId} · ${range.startDate}→${range.endDate}`,
        `Spend ${money(performance.spendMicros)} · leads ${leadTotals.total}${leadTotals.truncated ? "+" : ""} (${leadTotals.charged} charged, ${leadTotals.booked} booked) · cost/charged lead ${money(performance.costPerChargedLeadMicros)}${leadTotals.truncated ? " (upper bound)" : ""}`,
        `Lead types: ${leadTotals.phoneCalls} calls, ${leadTotals.messages} messages, ${leadTotals.bookings} bookings`,
        `Pacing: last 7 days ${money(pacing.last7DaysSpendMicros)} of ${money(pacing.weeklyBudgetMicros)}/week (${utilization})`,
      ];
      if (leadTotals.truncated) {
        lines.push(
          `Note: lead counts stop at ${leadTotals.total} for this window. Spend is complete, so every lead total is a floor and cost/charged lead an upper bound.`,
        );
      }
      if (performance.campaigns.length > 0) {
        const columns: McpTableColumn<
          (typeof performance.campaigns)[number]
        >[] = [
          { header: "campaign", value: (row) => row.name ?? row.id },
          { header: "status", value: (row) => row.status ?? "—" },
          {
            header: "budget",
            value: (row) => row.budgetAmountMicros,
            format: (value) =>
              typeof value === "number"
                ? `${formatMoney(value, performance.currencyCode)}/day`
                : "—",
          },
        ];
        lines.push(formatMcpTable(performance.campaigns, columns));
      }
      return mcpResponse({
        text: lines.join("\n"),
        meta,
        structuredContent: {
          ok: true,
          customerId: performance.customerId,
          currencyCode: performance.currencyCode,
          startDate: range.startDate,
          endDate: range.endDate,
          spendMicros: performance.spendMicros,
          costPerChargedLeadMicros: performance.costPerChargedLeadMicros,
          leadTotals,
          pacing,
          campaigns: performance.campaigns,
        },
      });
    } catch (error) {
      return reportErrorResponse(error, meta, connectUrl);
    }
  }),
};

// ---------------------------------------------------------------------------
// get_local_services_leads
// ---------------------------------------------------------------------------

const leadsInputSchema = {
  projectId: projectIdSchema,
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Explicit start (YYYY-MM-DD, account time zone). Default: last 28 days.",
    ),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit end (YYYY-MM-DD). Use with startDate."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LEAD_LIMIT)
    .optional()
    .describe(
      `Max leads to return, newest first (default ${DEFAULT_LEAD_LIMIT}).`,
    ),
} as const;

type LeadsArgs = z.infer<z.ZodObject<typeof leadsInputSchema>>;

function formatCallDuration(millis: number | null): string {
  if (millis == null) return "—";
  return `${Math.round(millis / 1000)}s`;
}

const LEAD_COLUMNS: McpTableColumn<LocalServicesLead>[] = [
  {
    header: "created",
    value: (row) => row.creationDateTime ?? "—",
  },
  { header: "type", value: (row) => row.leadType ?? "—" },
  { header: "status", value: (row) => row.leadStatus ?? "—" },
  {
    header: "charged",
    value: (row) => (row.charged ? "yes" : "no"),
  },
  {
    header: "credit",
    value: (row) => row.creditState ?? "—",
  },
  {
    header: "feedback",
    value: (row) =>
      row.leadFeedbackSubmitted == null
        ? "—"
        : row.leadFeedbackSubmitted
          ? "yes"
          : "no",
  },
  {
    header: "duration",
    value: (row) => formatCallDuration(row.conversationDurationMillis),
  },
  {
    header: "contact",
    value: (row) =>
      row.consumerPhoneNumber ?? row.consumerEmail ?? row.consumerName ?? "—",
  },
];

export const getLocalServicesLeadsTool = {
  name: "get_local_services_leads",
  config: {
    title: "List Local Services Ads leads",
    description:
      "List the connected Google Ads account's Local Services Ads leads, newest first: type (call/message/booking), status (e.g. NEW, BOOKED), whether the lead was charged, Google credit_state (CREDITED/PENDING when present), whether feedback was already submitted, phone-call duration in milliseconds, and the consumer's contact details. Does not return call recordings. Lead contents are customer PII — handle accordingly. Read-only; uses no credits.",
    inputSchema: leadsInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      currencyCode: z.string().nullable().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      leadCount: z.number().optional(),
      leads: z
        .array(
          z
            .object({
              id: z.string(),
              leadType: z.string().nullable(),
              leadStatus: z.string().nullable(),
              categoryId: z.string().nullable(),
              serviceId: z.string().nullable(),
              creationDateTime: z.string().nullable(),
              charged: z.boolean(),
              consumerName: z.string().nullable(),
              consumerPhoneNumber: z.string().nullable(),
              consumerEmail: z.string().nullable(),
              creditState: z.string().nullable(),
              leadFeedbackSubmitted: z.boolean().nullable(),
              conversationDurationMillis: z.number().nullable(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: LeadsArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = connectGoogleAdsUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );
    if (Boolean(args.startDate) !== Boolean(args.endDate)) {
      return mcpResponse({
        text: "Provide both startDate and endDate, or neither.",
        meta,
        structuredContent: { ok: false, reason: "invalid_request" },
      });
    }

    try {
      const { leads, dateRange: range } =
        await LocalServicesReportingService.listLeads({
          projectId: args.projectId,
          startDate: args.startDate,
          endDate: args.endDate,
          limit: args.limit ?? DEFAULT_LEAD_LIMIT,
        });
      const header = `LSA leads · ${range.startDate}→${range.endDate} · ${leads.length} lead${leads.length === 1 ? "" : "s"} (newest first)`;
      const text =
        leads.length > 0
          ? `${header}\n${formatMcpTable(leads, LEAD_COLUMNS)}`
          : `${header}\nNo leads in this date range.`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          startDate: range.startDate,
          endDate: range.endDate,
          leadCount: leads.length,
          leads,
        },
      });
    } catch (error) {
      return reportErrorResponse(error, meta, connectUrl);
    }
  }),
};

// ---------------------------------------------------------------------------
// provide_lead_feedback
// ---------------------------------------------------------------------------

const feedbackInputSchema = {
  projectId: projectIdSchema,
  leadId: z
    .string()
    .regex(/^\d{1,19}$/)
    .describe(
      "Numeric Local Services lead id (from get_local_services_leads).",
    ),
  surveyAnswer: z
    .enum(SURVEY_ANSWERS)
    .describe(
      "Live, irreversible survey answer. Dispute filings use VERY_DISSATISFIED. There is no dry run.",
    ),
  surveyDissatisfiedReason: z
    .enum(DISSATISFIED_REASONS)
    .optional()
    .describe(
      "Required for DISSATISFIED / VERY_DISSATISFIED. Use the audit finding's suggestedReason verbatim.",
    ),
  surveySatisfiedReason: z
    .enum(SATISFIED_REASONS)
    .optional()
    .describe("Required for SATISFIED / VERY_SATISFIED."),
  otherReasonComment: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Required only for OTHER_* reasons. Generic phrasing only — never call content, caller details, or transcripts.",
    ),
} as const;

type FeedbackArgs = z.infer<z.ZodObject<typeof feedbackInputSchema>>;

export const provideLeadFeedbackTool = {
  name: "provide_lead_feedback",
  config: {
    title: "Provide Local Services lead feedback",
    description:
      "File Google's one-shot Local Services Ads lead-feedback survey (ProvideLeadFeedback). Live and irreversible: the v25 request has no validate_only, and Google accepts one survey per lead. Refuses when lead_feedback_submitted is already true. Returns creditIssuanceDecision verbatim (SUCCESS_NOT_REACHED_THRESHOLD, SUCCESS_REACHED_THRESHOLD, FAIL_OVER_THRESHOLD, FAIL_NOT_ELIGIBLE). Do not put transcripts or caller details in otherReasonComment; enum-only by default. Uses no OpenSEO credits.",
    inputSchema: feedbackInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      leadId: z.string().optional(),
      creditIssuanceDecision: z.string().optional(),
      leadFeedbackSubmitted: z.boolean().nullable().optional(),
      creditState: z.string().nullable().optional(),
      charged: z.boolean().optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: FeedbackArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = connectGoogleAdsUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );

    try {
      const result = await LocalServicesReportingService.provideLeadFeedback({
        projectId: args.projectId,
        leadId: args.leadId,
        surveyAnswer: args.surveyAnswer,
        surveyDissatisfiedReason: args.surveyDissatisfiedReason,
        surveySatisfiedReason: args.surveySatisfiedReason,
        otherReasonComment: args.otherReasonComment,
      });
      const submitted =
        result.leadFeedbackSubmitted === null
          ? ""
          : ` · lead_feedback_submitted=${result.leadFeedbackSubmitted}`;
      const credit =
        result.creditState == null
          ? ""
          : ` · credit_state=${result.creditState}`;
      return mcpResponse({
        text: `LSA feedback · lead ${result.leadId} · ${result.creditIssuanceDecision}${submitted}${credit}`,
        meta,
        structuredContent: {
          ok: true,
          leadId: result.leadId,
          creditIssuanceDecision: result.creditIssuanceDecision,
          leadFeedbackSubmitted: result.leadFeedbackSubmitted,
          creditState: result.creditState,
          charged: result.charged,
        },
      });
    } catch (error) {
      return reportErrorResponse(error, meta, connectUrl);
    }
  }),
};
