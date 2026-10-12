import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { MetricsTable } from "@/client/components/MetricsTable";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { moreDetailsClass } from "@/client/features/dashboard/cardParts";
import { getLocalServicesDashboardReport } from "@/serverFunctions/google-ads";

// Google reports spend in the Ads account's own currency. Intl throws on a
// code that isn't three letters, so anything else falls back to a bare number
// rather than implying dollars.
const CURRENCY_CODE = /^[A-Za-z]{3}$/;

function money(
  microsValue: number | null | undefined,
  currencyCode: string | null,
): string {
  if (typeof microsValue !== "number") return "—";
  const amount = microsValue / 1_000_000;
  if (!currencyCode || !CURRENCY_CODE.test(currencyCode)) {
    return amount.toFixed(2);
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

/** Rendered only when the Google Ads connection exists; the connect flow
 *  lives on the integrations settings page, not the dashboard. */
export function LocalServicesCard({ projectId }: { projectId: string }) {
  const reportQuery = useQuery({
    queryKey: ["dashboardLocalServicesReport", projectId],
    queryFn: () => getLocalServicesDashboardReport({ data: { projectId } }),
  });
  const report = reportQuery.data;

  return (
    <CardShell
      title="Local Services Ads"
      action={
        <Link
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
          hash="google-ads"
          className={moreDetailsClass}
        >
          Manage
        </Link>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Google Ads · Last 28 days
      </p>
      {reportQuery.isPending ? (
        <div aria-busy>
          <SkeletonTableRows rows={4} columns={2} />
        </div>
      ) : reportQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Local Services data. Try again shortly.
        </p>
      ) : report?.connected &&
        "accessPending" in report &&
        report.accessPending ? (
        <p className="text-sm text-muted-foreground">
          Waiting on Google&rsquo;s Ads API access approval. Data appears here
          automatically once Google finishes onboarding.
        </p>
      ) : report?.connected &&
        "requestRejected" in report &&
        report.requestRejected ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Local Services data. Google rejected the report
          request, so retrying won&rsquo;t help.
        </p>
      ) : report?.connected && report.performance ? (
        <Performance performance={report.performance} />
      ) : (
        <p className="text-sm text-muted-foreground">
          The Google Ads connection needs attention.{" "}
          <Link
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
            hash="google-ads"
            className="font-medium underline underline-offset-2"
          >
            Reconnect
          </Link>
        </p>
      )}
    </CardShell>
  );
}

type Performance = NonNullable<
  Extract<
    Awaited<ReturnType<typeof getLocalServicesDashboardReport>>,
    { performance?: unknown }
  >["performance"]
>;

function Detail({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs text-muted-foreground">{children}</span>
  );
}

function Performance({ performance }: { performance: Performance }) {
  const { currencyCode, leadTotals, pacing } = performance;
  const amount = (microsValue: number | null | undefined) =>
    money(microsValue, currencyCode);
  return (
    <div className="space-y-3">
      <MetricsTable
        rows={[
          { label: "Spend", value: amount(performance.spendMicros) },
          {
            label: (
              <>
                Leads
                <Detail>
                  {leadTotals.charged} charged · {leadTotals.booked} booked
                </Detail>
              </>
            ),
            value: `${leadTotals.total}${leadTotals.truncated ? "+" : ""}`,
          },
          {
            label: leadTotals.truncated
              ? "Cost / charged lead (max)"
              : "Cost / charged lead",
            value: amount(performance.costPerChargedLeadMicros),
          },
          {
            label: (
              <>
                7-day pacing
                <Detail>
                  {amount(pacing.last7DaysSpendMicros)} of{" "}
                  {amount(pacing.weeklyBudgetMicros)}/wk
                </Detail>
              </>
            ),
            value:
              pacing.utilization === null
                ? "—"
                : `${Math.round(pacing.utilization * 100)}%`,
          },
        ]}
      />
      {leadTotals.truncated ? (
        <p className="text-xs text-muted-foreground">
          Lead counts stop at {leadTotals.total.toLocaleString()} for this
          window. Spend is complete, so cost per charged lead is an upper bound.
        </p>
      ) : null}
    </div>
  );
}
