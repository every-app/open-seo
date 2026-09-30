import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  moreDetailsClass,
  Stat,
} from "@/client/features/dashboard/cardParts";
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
      stamp="Google Ads · last 28 days"
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
      {reportQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : reportQuery.isError ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Local Services data. Try again shortly.
        </p>
      ) : report?.connected &&
        "accessPending" in report &&
        report.accessPending ? (
        <p className="text-sm text-base-content/60">
          Waiting on Google&rsquo;s Ads API access approval. Data appears here
          automatically once Google finishes onboarding.
        </p>
      ) : report?.connected &&
        "requestRejected" in report &&
        report.requestRejected ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Local Services data. Google rejected the report
          request, so retrying won&rsquo;t help.
        </p>
      ) : report?.connected && report.performance ? (
        <Performance performance={report.performance} />
      ) : (
        <p className="text-sm text-base-content/60">
          The Google Ads connection needs attention.{" "}
          <Link
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
            hash="google-ads"
            className="link"
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

function Performance({ performance }: { performance: Performance }) {
  const { currencyCode, leadTotals, pacing } = performance;
  const amount = (microsValue: number | null | undefined) =>
    money(microsValue, currencyCode);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Spend" value={amount(performance.spendMicros)} />
        <Stat
          label="Leads"
          value={`${leadTotals.total}${leadTotals.truncated ? "+" : ""}`}
          sub={
            <span className="text-xs text-base-content/50">
              {leadTotals.charged} charged · {leadTotals.booked} booked
            </span>
          }
        />
        <Stat
          label={
            leadTotals.truncated
              ? "Cost / charged lead (max)"
              : "Cost / charged lead"
          }
          value={amount(performance.costPerChargedLeadMicros)}
        />
        <Stat
          label="7-day pacing"
          value={
            pacing.utilization === null
              ? "—"
              : `${Math.round(pacing.utilization * 100)}%`
          }
          sub={
            <span className="text-xs text-base-content/50">
              {amount(pacing.last7DaysSpendMicros)} of{" "}
              {amount(pacing.weeklyBudgetMicros)}/wk
            </span>
          }
        />
      </div>
      {leadTotals.truncated ? (
        <p className="text-xs text-base-content/50">
          Lead counts stop at {leadTotals.total.toLocaleString()} for this
          window. Spend is complete, so cost per charged lead is an upper bound.
        </p>
      ) : null}
    </div>
  );
}
