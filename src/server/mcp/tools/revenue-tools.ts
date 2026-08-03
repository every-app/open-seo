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
import { RapidapiService } from "@/server/features/revenue/services/RapidapiService";
import {
  StripeRevenueService,
  StripeNotConnectedError,
} from "@/server/features/revenue/services/StripeRevenueService";
import { isExpectedStripeFailure } from "@/server/lib/stripeClient";

const revenueInputSchema = { projectId: projectIdSchema } as const;

type RevenueArgs = z.infer<z.ZodObject<typeof revenueInputSchema>>;

type SnapshotRow = {
  capturedOn: string;
  activeSubscribers: number;
  payingSubscribers: number | null;
};

const snapshotColumns: McpTableColumn<SnapshotRow>[] = [
  { header: "date", value: (row) => row.capturedOn },
  { header: "active", value: (row) => row.activeSubscribers },
  { header: "paying", value: (row) => row.payingSubscribers ?? "—" },
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

export const getRapidapiSnapshotsTool = {
  name: "get_rapidapi_snapshots",
  config: {
    title: "Get RapidAPI subscriber snapshots",
    description:
      "Manually-logged RapidAPI subscriber snapshots for this project (RapidAPI exposes no API for public-marketplace subscriber data, so numbers are logged by hand from Studio Analytics on the Revenue page): latest active/paying counts with the change since the previous snapshot, plus the snapshot history. Counts only — no subscriber identities. Read-only; uses no credits.",
    inputSchema: revenueInputSchema,
    outputSchema: {
      ok: z.boolean(),
      latest: looseObjectOutputSchema.nullable().optional(),
      activeDelta: z.number().nullable().optional(),
      payingDelta: z.number().nullable().optional(),
      snapshotCount: z.number().optional(),
      snapshots: z.array(looseObjectOutputSchema).optional(),
      logUrl: z.string().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RevenueArgs, context) => {
    const logUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/revenue`,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/revenue`,
    );
    const { snapshots, report } = await RapidapiService.listSnapshots(
      args.projectId,
    );
    if (!report.latest) {
      return mcpResponse({
        text: `No RapidAPI snapshots logged yet. Log the current subscriber numbers on the Revenue page: ${logUrl}`,
        meta,
        structuredContent: { ok: true, latest: null, snapshotCount: 0, logUrl },
      });
    }
    const latest = report.latest;
    const deltas =
      report.activeDelta === null
        ? ""
        : ` (${report.activeDelta >= 0 ? "+" : ""}${report.activeDelta} active${
            report.payingDelta === null
              ? ""
              : `, ${report.payingDelta >= 0 ? "+" : ""}${report.payingDelta} paying`
          } since ${report.previous?.capturedOn})`;
    const summary = `Latest snapshot ${latest.capturedOn}: ${latest.activeSubscribers} active / ${latest.payingSubscribers ?? "—"} paying${deltas}`;
    const rows = snapshots.slice(0, 24);
    return mcpResponse({
      text: `${summary}\n${formatMcpTable(rows, snapshotColumns)}`,
      meta,
      structuredContent: {
        ok: true,
        latest,
        activeDelta: report.activeDelta,
        payingDelta: report.payingDelta,
        snapshotCount: snapshots.length,
        snapshots: rows,
        logUrl,
      },
    });
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
