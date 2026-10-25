import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Users } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { percentChange } from "@/client/components/MetricsTable";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import {
  isWebAnalyticsPeriod,
  WEB_ANALYTICS_PERIODS,
  type WebAnalyticsPeriod,
} from "@/types/schemas/web-analytics";
import { getWebAnalyticsOverview } from "@/serverFunctions/webAnalytics";
import { WebAnalyticsBreakdown } from "./WebAnalyticsBreakdown";

const PERIOD_LABELS: Record<WebAnalyticsPeriod, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

const chartConfig = {
  visitors: { label: "Visitors", color: "var(--color-primary)" },
  pageviews: { label: "Pageviews", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatBucket(bucket: string, granularity: "hour" | "day"): string {
  if (granularity === "hour") {
    // "2026-10-25T14" -> "14:00"
    return `${bucket.slice(11)}:00`;
  }
  const [, month, day] = bucket.split("-");
  return new Date(
    Number(bucket.slice(0, 4)),
    Number(month) - 1,
    Number(day),
  ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDelta(current: number, previous: number): string {
  const change = percentChange(current, previous);
  if (change === null) return "—";
  return `${change > 0 ? "+" : ""}${change}% vs previous`;
}

function KpiCard({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">
          {formatDelta(current, previous)}
        </p>
      </CardContent>
    </Card>
  );
}

export function WebAnalyticsDashboard({
  projectId,
  snippet,
  period,
  onPeriodChange,
  onDisable,
  disabling,
}: {
  projectId: string;
  snippet: string;
  period: WebAnalyticsPeriod;
  onPeriodChange: (period: WebAnalyticsPeriod) => void;
  onDisable: () => void;
  disabling: boolean;
}) {
  const overviewQuery = useQuery({
    queryKey: ["webAnalyticsOverview", projectId, period],
    queryFn: () => getWebAnalyticsOverview({ data: { projectId, period } }),
  });

  return (
    <QueryState
      query={overviewQuery}
      errorFallback="Could not load web analytics."
    >
      {({ kpis, previous, online, series }) => {
        const granularity = period === "today" ? "hour" : "day";

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold">Web Analytics</h1>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  {formatCount(online)} online now
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Tabs
                  value={period}
                  onValueChange={(value) => {
                    if (isWebAnalyticsPeriod(value)) onPeriodChange(value);
                  }}
                >
                  <TabsList>
                    {WEB_ANALYTICS_PERIODS.map((value) => (
                      <TabsTrigger key={value} value={value}>
                        {PERIOD_LABELS[value]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDisable}
                  disabled={disabling}
                >
                  Disable
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Visitors"
                value={formatCount(kpis.visitors)}
                current={kpis.visitors}
                previous={previous.visitors}
              />
              <KpiCard
                label="Sessions"
                value={formatCount(kpis.sessions)}
                current={kpis.sessions}
                previous={previous.sessions}
              />
              <KpiCard
                label="Pageviews"
                value={formatCount(kpis.pageviews)}
                current={kpis.pageviews}
                previous={previous.pageviews}
              />
              <KpiCard
                label="Bounce rate"
                value={`${Math.round(kpis.bounceRate * 100)}%`}
                current={kpis.bounceRate}
                previous={previous.bounceRate}
              />
              <KpiCard
                label="Avg. engaged time"
                value={formatDuration(kpis.avgDurationMs)}
                current={kpis.avgDurationMs}
                previous={previous.avgDurationMs}
              />
            </div>

            <CardShell title="Visitors and pageviews">
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <AreaChart data={series}>
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(bucket: string) =>
                      formatBucket(bucket, granularity)
                    }
                    minTickGap={30}
                  />
                  <YAxis width={32} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(bucket) =>
                          formatBucket(String(bucket), granularity)
                        }
                      />
                    }
                  />
                  <Area
                    dataKey="pageviews"
                    type="monotone"
                    fillOpacity={0.15}
                    stroke="var(--color-pageviews)"
                    fill="var(--color-pageviews)"
                  />
                  <Area
                    dataKey="visitors"
                    type="monotone"
                    fillOpacity={0.15}
                    stroke="var(--color-visitors)"
                    fill="var(--color-visitors)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardShell>

            <div className="grid gap-4 lg:grid-cols-2">
              <WebAnalyticsBreakdown
                projectId={projectId}
                period={period}
                dimension="page"
                title="Top pages"
                valueLabel="Pageviews"
              />
              <WebAnalyticsBreakdown
                projectId={projectId}
                period={period}
                dimension="source"
                title="Traffic sources"
                valueLabel="Visitors"
              />
              <WebAnalyticsBreakdown
                projectId={projectId}
                period={period}
                dimension="country"
                title="Countries"
                valueLabel="Visitors"
              />
              <WebAnalyticsBreakdown
                projectId={projectId}
                period={period}
                dimension="device"
                title="Devices"
                valueLabel="Visitors"
              />
            </div>

            <CardShell title="Install the tracker">
              <p className="mb-3 text-sm text-muted-foreground">
                Add this tag to every page of your site (or its layout
                template). It also tracks single-page-app navigation, outbound
                links and{" "}
                <code className="rounded bg-muted px-1">data-wa-goal</code>{" "}
                attributes.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                {snippet}
              </pre>
            </CardShell>
          </div>
        );
      }}
    </QueryState>
  );
}
