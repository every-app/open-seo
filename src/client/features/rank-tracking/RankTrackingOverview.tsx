import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import { computeScorecards } from "./rankTrackingScorecards";
import {
  formatDateTick,
  TrendRangeToggle,
  useChartWidth,
} from "./RankTrackingTrendChart";

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
  rows,
  device,
  projectId,
  configId,
}: {
  rows: RankTrackingRow[];
  device: "desktop" | "mobile";
  projectId: string;
  configId: string;
}) {
  const [sinceDays, setSinceDays] = useState(730);

  const scorecards = useMemo(
    () => computeScorecards(rows, device),
    [rows, device],
  );

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
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {/* All metrics in one card */}
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Scorecard
              label="Visibility"
              value={
                scorecards.visibility === null
                  ? "-"
                  : `${Math.round(scorecards.visibility)}%`
              }
              delta={scorecards.visibilityDelta}
              hint="of click potential"
            />
            <Scorecard
              label="Ranking"
              value={String(scorecards.ranking)}
              delta={scorecards.rankingDelta}
              hint={`of ${rows.length} tracked`}
            />
            <Scorecard
              label="In Top 3"
              value={String(scorecards.top3)}
              hint="of ranked keywords"
            />
            <Scorecard
              label="In Top 10"
              value={String(scorecards.top10)}
              hint="includes Top 3"
            />
            <Scorecard
              label="Improved / Declined"
              value={`${scorecards.improved} / ${scorecards.declined}`}
              hint="vs comparison period"
            />
          </div>
        </div>

        {/* Position distribution */}
        <div className="rounded-lg border border-base-300 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Position distribution</span>
            <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {BUCKETS.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center gap-1 text-[11px] text-base-content/60"
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
              <Loader2 className="size-4 animate-spin text-base-content/50" />
            </div>
          ) : chartData.length <= 1 ? (
            <div className="rounded-lg border border-dashed border-base-300 p-8 text-center text-xs text-base-content/60">
              {chartData.length === 0
                ? "No history yet — run a check to start tracking positions over time."
                : "Only 1 check so far — the trend fills in after the next check."}
            </div>
          ) : (
            <div
              ref={containerRef}
              className="w-full min-w-0"
              style={{ height: 180 }}
            >
              {width > 0 ? (
                <AreaChart
                  width={width}
                  height={180}
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    opacity={0.1}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="checkedAt"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatDateTick}
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#888" }}
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
                      return (
                        <DistributionTooltip label={label} byKey={byKey} />
                      );
                    }}
                    cursor={{ stroke: "rgba(150,150,150,0.3)" }}
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
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm space-y-0.5">
      <p className="text-xs text-base-content/60">
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
          <span className="text-base-content/60">{b.label}:</span>
          <span className="font-medium tabular-nums">
            {byKey.get(b.key) ?? 0}
          </span>
        </p>
      ))}
    </div>
  );
}

function Scorecard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-base-content/55">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span
            className={`text-xs font-medium ${
              delta > 0 ? "text-success" : "text-warning"
            }`}
          >
            {delta > 0 ? "▲" : "▼"}{" "}
            {Number.isInteger(delta)
              ? Math.abs(delta)
              : Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-base-content/45">{hint}</p>}
    </div>
  );
}
