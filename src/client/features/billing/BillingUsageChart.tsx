import { useAggregateEvents } from "autumn-js/react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

const BILLING_USAGE_FEATURE_IDS: string[] = [
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
];

export function BillingUsageChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setChartWidth(el.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const eventsQuery = useAggregateEvents({
    featureId: BILLING_USAGE_FEATURE_IDS,
    range: "30d",
    binSize: "day",
  });

  const chartData = (eventsQuery.list ?? []).map((row) => ({
    date: row.period,
    credits: autumnSeoDataCreditsToUsd(
      BILLING_USAGE_FEATURE_IDS.reduce(
        (sum, featureId) => sum + (row.values?.[featureId] ?? 0),
        0,
      ),
    ),
  }));

  const totalSpend = chartData.reduce((sum, d) => sum + d.credits, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-4 space-y-0 p-5 pb-3">
        <CardTitle className="text-base">Usage</CardTitle>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </CardHeader>

      <CardContent className="space-y-3 p-5 pt-0">
        <div className="text-2xl font-semibold tabular-nums">
          ${totalSpend.toFixed(2)}
        </div>

        <div ref={containerRef} className="h-32 w-full min-w-0">
          {eventsQuery.isLoading ? null : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-muted-foreground">
                No usage recorded yet
              </span>
            </div>
          ) : chartWidth > 0 ? (
            <BarChart
              width={chartWidth}
              height={128}
              data={chartData}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                opacity={0.06}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatUsdAxis}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                content={<UsageTooltip />}
                cursor={{ fill: "var(--accent)" }}
              />
              <Bar
                dataKey="credits"
                fill="var(--chart-1)"
                radius={[2, 2, 0, 0]}
                maxBarSize={12}
              />
            </BarChart>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function UsageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg backdrop-blur-xl">
      <p className="text-xs text-muted-foreground">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </p>
      <p className="text-sm font-medium tabular-nums">
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatUsdAxis(value: number) {
  return `$${value % 1 === 0 ? value : value.toFixed(2)}`;
}
