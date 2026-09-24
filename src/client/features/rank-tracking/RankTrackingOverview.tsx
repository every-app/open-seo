import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { getRankConfigTrend } from "@/serverFunctions/rank-tracking";
import {
  formatDateTick,
  TrendRangeToggle,
  useChartWidth,
} from "./RankTrackingTrendChart";

import { Spinner } from "@/client/components/ui/spinner";

// Upstream's mid-tone fills: they read on both themes, where the status
// text tokens go dark in light mode and turn the stacked areas muddy.
const BUCKETS = [
  { key: "top3", label: "Top 3", color: "#16a34a" },
  { key: "top4to10", label: "4–10", color: "#2563eb" },
  { key: "top11to20", label: "11–20", color: "#f59e0b" },
  { key: "notRanking", label: "Not in top 20", color: "#6b7280" },
] as const;

/** Narrowed recharts tooltip payload entry (typed `any` upstream). */
interface PayloadEntry {
  dataKey?: string | number;
  value?: number | string | null;
}

export function RankTrackingOverview({
  device,
  projectId,
  configId,
}: {
  device: "desktop" | "mobile";
  projectId: string;
  configId: string;
}) {
  const [sinceDays, setSinceDays] = useState(730);

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["rankConfigTrend", projectId, configId, device, sinceDays],
    queryFn: () =>
      getRankConfigTrend({
        data: { projectId, configId, device, sinceDays },
      }),
  });

  const chartData = useMemo(
    () =>
      (trend ?? []).map((p) => ({
        checkedAt: new Date(p.checkedAt).getTime(),
        top3: p.top3,
        top4to10: p.top4to10,
        top11to20: p.top11to20,
        notRanking: p.notRanking,
      })),
    [trend],
  );

  const { containerRef, width } = useChartWidth();

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Position distribution</span>
          <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {BUCKETS.map((b) => (
            <span
              key={b.key}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            >
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </span>
          ))}
        </div>

        {trendLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" />
          </div>
        ) : chartData.length <= 1 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            {chartData.length === 0
              ? "No history yet — run a check to start tracking positions over time."
              : "Only 1 check so far — the trend fills in after the next check."}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full min-w-0"
            style={{ height: 220 }}
          >
            {width > 0 ? (
              <AreaChart
                width={width}
                height={220}
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--trend-grid-color)"
                  vertical={false}
                />
                <XAxis
                  dataKey="checkedAt"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatDateTick}
                  tick={{ fontSize: 10, fill: "var(--trend-axis-color)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--trend-axis-color)" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  content={(props: TooltipContentProps<number, string>) => {
                    const { active, payload, label } = props;
                    if (
                      !active ||
                      !payload?.length ||
                      typeof label !== "number"
                    ) {
                      return null;
                    }
                    const byKey = new Map(
                      payload.map((p: PayloadEntry) => [
                        String(p.dataKey),
                        typeof p.value === "number" ? p.value : 0,
                      ]),
                    );
                    return <DistributionTooltip label={label} byKey={byKey} />;
                  }}
                  cursor={{ stroke: "var(--trend-grid-color)" }}
                />
                {BUCKETS.map((b) => (
                  <Area
                    key={b.key}
                    type="monotone"
                    dataKey={b.key}
                    name={b.label}
                    stackId="positions"
                    stroke={b.color}
                    fill={b.color}
                    fillOpacity={0.7}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function DistributionTooltip({
  label,
  byKey,
}: {
  label: number;
  byKey: Map<string, number>;
}) {
  return (
    <div className="space-y-0.5 rounded-md border border-[var(--trend-tooltip-border)] bg-[var(--trend-tooltip-bg)] px-3 py-2 shadow-[0_8px_24px_var(--trend-tooltip-shadow)] backdrop-blur-xl">
      <p className="text-xs text-muted-foreground">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {BUCKETS.map((b) => (
        <p key={b.key} className="text-xs flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: b.color }}
          />
          <span className="text-muted-foreground">{b.label}:</span>
          <span className="font-medium tabular-nums">
            {byKey.get(b.key) ?? 0}
          </span>
        </p>
      ))}
    </div>
  );
}
