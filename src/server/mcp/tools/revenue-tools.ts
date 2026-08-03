import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import {
  RapidapiService,
  RapidapiNotConnectedError,
} from "@/server/features/revenue/services/RapidapiService";
import {
  StripeRevenueService,
  StripeNotConnectedError,
} from "@/server/features/revenue/services/StripeRevenueService";
import { isExpectedRapidapiFailure } from "@/server/lib/rapidapiClient";
import { isExpectedStripeFailure } from "@/server/lib/stripeClient";

const revenueInputSchema = { projectId: projectIdSchema } as const;

type RevenueArgs = z.infer<z.ZodObject<typeof revenueInputSchema>>;

type RecentRow = {
  entityId: string | null;
  entityType: string | null;
  planName: string | null;
  status: string | null;
  createdAt: string | null;
  canceledAt: string | null;
};

// Subscriber identity is the opaque entity id only — names and emails are
// never fetched from RapidAPI, so they can't leak here. See specs/0014.
const recentColumns: McpTableColumn<RecentRow>[] = [
  { header: "entityId", value: (row) => row.entityId ?? "—" },
  { header: "type", value: (row) => row.entityType ?? "—" },
  { header: "plan", value: (row) => row.planName ?? "—" },
  { header: "status", value: (row) => row.status ?? "—" },
  { header: "started", value: (row) => row.createdAt?.slice(0, 10) ?? "—" },
  { header: "canceled", value: (row) => row.canceledAt?.slice(0, 10) ?? "—" },
];

function notConnectedResponse(
  meta: ReturnType<typeof buildProjectMeta>,
  connectUrl: string,
  what: string,
) {
  return mcpResponse({
    text: `${what} is not connected for this project. Connect it in project settings: ${connectUrl}`,
    meta,
    structuredContent: { ok: false, reason: "not_connected", connectUrl },
  });
}

export const getRapidapiSubscriptionsTool = {
  name: "get_rapidapi_subscriptions",
  config: {
    title: "Get RapidAPI subscription metrics",
    description:
      "Subscriber metrics for the project's connected RapidAPI listing: active and paying subscriber counts, new subscriptions and churn over the last 30 days with a prior-30-day comparison, and the most recent subscription events. Subscribers are identified by opaque entity ids only (no names or emails). Read-only; uses no credits.",
    inputSchema: revenueInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      apiName: z.string().nullable().optional(),
      metrics: looseObjectOutputSchema.optional(),
      recent: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RevenueArgs, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );
    try {
      const report = await RapidapiService.getSubscriptionReport({
        projectId: args.projectId,
      });
      const { metrics } = report;
      const paying =
        metrics.payingSubscribers === null
          ? "unknown (plan prices not exposed)"
          : String(metrics.payingSubscribers);
      const summary = `${report.apiName ?? report.rapidapiApiId} · ${metrics.activeSubscribers} active subscribers (${paying} paying) · last 30d: +${metrics.newLast30} new / -${metrics.churnedLast30} churned (prev 30d: +${metrics.newPrev30} / -${metrics.churnedPrev30})`;
      const text =
        report.recent.length === 0
          ? summary
          : `${summary}\n${formatMcpTable(report.recent, recentColumns)}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          apiName: report.apiName,
          metrics,
          recent: report.recent,
        },
      });
    } catch (error) {
      if (error instanceof RapidapiNotConnectedError) {
        return notConnectedResponse(meta, connectUrl, "RapidAPI");
      }
      if (isExpectedRapidapiFailure(error)) {
        return mcpResponse({
          text: "The RapidAPI key was rejected (revoked or missing Platform API access). Update RAPIDAPI_KEY / RAPIDAPI_GRAPHQL_URL on this deployment.",
          meta,
          structuredContent: { ok: false, reason: "api_error", connectUrl },
        });
      }
      throw error;
    }
  }),
};

export const getStripeRevenueTool = {
  name: "get_stripe_revenue",
  config: {
    title: "Get Stripe revenue metrics",
    description:
      "Revenue metrics for the project's mapped Stripe products: active subscribers, estimated MRR, and 30-day new/churn for the subscription product, plus purchase count, gross revenue, refunds, and net revenue for the one-off product — each with a prior-30-day comparison. Amounts are in the account's minor currency units (e.g. cents). No customer identities are included. Read-only; uses no credits.",
    inputSchema: revenueInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      subscription: looseObjectOutputSchema.nullable().optional(),
      oneOff: looseObjectOutputSchema.nullable().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RevenueArgs, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );
    try {
      const report = await StripeRevenueService.getRevenue({
        projectId: args.projectId,
      });
      const lines: string[] = [];
      if (report.subscription) {
        const s = report.subscription;
        const mrr = s.mrr
          ? `${(s.mrr.amount / 100).toFixed(0)} ${s.mrr.currency.toUpperCase()}/mo est. MRR`
          : "no priced active plans";
        lines.push(
          `${s.productName ?? s.productId} (subscriptions): ${s.activeSubscribers} active · ${mrr} · last 30d: +${s.newLast30} new / -${s.churnedLast30} churned (prev 30d: +${s.newPrev30} / -${s.churnedPrev30})`,
        );
      }
      if (report.oneOff) {
        const o = report.oneOff;
        const currency = o.currency ? ` ${o.currency.toUpperCase()}` : "";
        lines.push(
          `${o.productName ?? o.productId} (one-off): ${o.purchasesLast30} purchases / ${(o.revenueLast30 / 100).toFixed(0)}${currency} gross last 30d (prev 30d: ${o.purchasesPrev30} / ${(o.revenuePrev30 / 100).toFixed(0)}${currency})`,
        );
        if (o.refunds) {
          const net = o.revenueLast30 - o.refunds.refundAmountLast30;
          lines.push(
            `  refunds last 30d: ${o.refunds.refundsLast30} / ${(o.refunds.refundAmountLast30 / 100).toFixed(0)}${currency} → net ${(net / 100).toFixed(0)}${currency}`,
          );
        } else {
          lines.push(
            "  refunds unavailable (STRIPE_SECRET_KEY lacks Refunds read access)",
          );
        }
      }
      return mcpResponse({
        text: lines.join("\n") || "No Stripe products are mapped yet.",
        meta,
        structuredContent: {
          ok: true,
          subscription: report.subscription,
          oneOff: report.oneOff,
        },
      });
    } catch (error) {
      if (error instanceof StripeNotConnectedError) {
        return notConnectedResponse(meta, connectUrl, "Stripe");
      }
      if (isExpectedStripeFailure(error)) {
        return mcpResponse({
          text: "The Stripe API key was rejected (revoked or missing read access). Update STRIPE_SECRET_KEY on this deployment.",
          meta,
          structuredContent: { ok: false, reason: "api_error", connectUrl },
        });
      }
      throw error;
    }
  }),
};
