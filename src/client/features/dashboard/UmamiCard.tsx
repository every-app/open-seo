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
  const reportQuery = useQuery({
    queryKey: ["dashboardUmamiReport", projectId],
    queryFn: () => getUmamiDashboardReport({ data: { projectId } }),
  });
  const report = reportQuery.data;

  return (
    <CardShell
      title="Organic traffic"
      action={
        <Link
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
          hash="umami"
          className={moreDetailsClass}
        >
          Manage
        </Link>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Umami
        {report?.status === "ok" ? ` · ${report.websiteName}` : ""} · Last 28
        days
      </p>
      {reportQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Umami data. Try again shortly.
        </p>
      ) : !report ? (
        <div className="space-y-3" aria-busy>
          <SkeletonTableRows rows={4} columns={3} />
          <Skeleton className="h-24" />
        </div>
      ) : report.status === "not_connected" ? (
        <p className="text-sm text-muted-foreground">
          Umami is no longer connected for this project.
        </p>
      ) : report.status === "error" ? (
        <p className="text-sm text-muted-foreground">{report.error.message}</p>
      ) : !report.totals.visits ? (
        <p className="text-sm text-muted-foreground">
          No visits from search engines recorded in the last 28 days yet.
        </p>
      ) : (
        <div className="space-y-4">
          <MetricsTable
            showChange
            rows={[
              {
                label: "Visits",
                value: formatCount(report.totals.visits),
                change: changeCell(
                  percentChange(report.totals.visits, report.prevTotals.visits),
                ),
              },
              {
                label: "Visitors",
                value: formatCount(report.totals.visitors),
                change: changeCell(
                  percentChange(
                    report.totals.visitors,
                    report.prevTotals.visitors,
                  ),
                ),
              },
              {
                label: "Pageviews",
                value: formatCount(report.totals.pageviews),
                change: changeCell(
                  percentChange(
                    report.totals.pageviews,
                    report.prevTotals.pageviews,
                  ),
                ),
              },
              {
                label: "Bounce rate",
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
