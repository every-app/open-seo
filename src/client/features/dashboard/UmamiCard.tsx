import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { CardShell } from "@/client/components/CardShell";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { moreDetailsClass } from "@/client/features/dashboard/cardParts";
import { MetricsTable, percentChange } from "@/client/components/MetricsTable";
import {
  formatCount,
  formatCtr,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getUmamiDashboardReport } from "@/serverFunctions/umami";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { useLocale } from "@/client/lib/i18n";

const visitorsChartConfig = {
  visitors: { label: "Visitors", color: "var(--color-primary)" },
} satisfies ChartConfig;

function formatTrendDay(date: string): string {
  // Local-time construction, as in the GA4 card, so the label isn't a day off.
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function changeCell(change: number | null) {
  if (change === null) return undefined;
  return (
    <span
      className={
        change > 0
          ? "text-success"
          : change < 0
            ? "text-destructive"
            : "text-muted-foreground"
      }
    >
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

/** Organic traffic from the project's Umami website: search-engine visits
 *  over the last 28 complete days against the 28 before. */
export function UmamiCard({ projectId }: { projectId: string }) {
  const { t } = useLocale();
  const reportQuery = useQuery({
    queryKey: ["dashboardUmamiReport", projectId],
    queryFn: () => getUmamiDashboardReport({ data: { projectId } }),
  });
  const report = reportQuery.data;

  return (
    <CardShell
      title={t("umami.organic_traffic")}
      action={
        <Link
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
          hash="umami"
          className={moreDetailsClass}
        >
          {t("umami.manage")}
        </Link>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Umami
        {report?.status === "ok" ? ` · ${report.websiteName}` : ""} ·{" "}
        {t("umami.last_28_days")}
      </p>
      {reportQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          {t("umami.could_not_load")}
        </p>
      ) : !report ? (
        <div className="space-y-3" aria-busy>
          <SkeletonTableRows rows={4} columns={3} />
          <Skeleton className="h-24" />
        </div>
      ) : report.status === "not_connected" ? (
        <p className="text-sm text-muted-foreground">
          {t("umami.not_connected_desc")}
        </p>
      ) : report.status === "error" ? (
        <p className="text-sm text-muted-foreground">{report.error.message}</p>
      ) : !report.totals.visits ? (
        <p className="text-sm text-muted-foreground">{t("umami.no_data")}</p>
      ) : (
        <div className="space-y-4">
          <MetricsTable
            showChange
            rows={[
              {
                label: t("umami.visits"),
                value: formatCount(report.totals.visits),
                change: changeCell(
                  percentChange(report.totals.visits, report.prevTotals.visits),
                ),
              },
              {
                label: t("umami.visitors"),
                value: formatCount(report.totals.visitors),
                change: changeCell(
                  percentChange(
                    report.totals.visitors,
                    report.prevTotals.visitors,
                  ),
                ),
              },
              {
                label: t("umami.pageviews"),
                value: formatCount(report.totals.pageviews),
                change: changeCell(
                  percentChange(
                    report.totals.pageviews,
                    report.prevTotals.pageviews,
                  ),
                ),
              },
              {
                label: t("umami.bounce_rate"),
                value:
                  report.totals.bounceRate === null
                    ? "—"
                    : formatCtr(report.totals.bounceRate),
                change: undefined,
              },
            ]}
          />
          <ChartContainer config={visitorsChartConfig} className="h-24">
            <AreaChart
              data={report.trend}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, "auto"]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label: unknown) =>
                      typeof label === "string" ? formatTrendDay(label) : ""
                    }
                    valueFormatter={(value) => formatCount(Number(value))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="visitors"
                stroke="var(--color-visitors)"
                strokeWidth={2}
                fill="var(--color-visitors)"
                fillOpacity={0.08}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </CardShell>
  );
}
