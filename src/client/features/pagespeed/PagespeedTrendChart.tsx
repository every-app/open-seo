import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatDateTick,
  useChartWidth,
} from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { buildTrendSeries } from "@/client/features/pagespeed/buildTrendSeries";
import {
  formatCls,
  formatMs,
  type PagespeedSnapshotLike,
} from "@/shared/pagespeed";

type MetricGroup = "scores" | "lab" | "field";

const GROUPS: Record<
  MetricGroup,
  {
    label: string;
    /** Scores share a fixed 0-100 axis; timings are auto-scaled. */
    domain?: [number, number];
    format: (value: number) => string;
    series: { dataKey: string; name: string; color: string }[];
  }
> = {
  scores: {
    label: "Scores",
    domain: [0, 100],
    format: (value) => String(value),
    series: [
      { dataKey: "performance", name: "Performance", color: "#8b5cf6" },
      { dataKey: "accessibility", name: "Accessibility", color: "#3b82f6" },
      { dataKey: "bestPractices", name: "Best practices", color: "#14b8a6" },
      { dataKey: "seo", name: "SEO", color: "#f59e0b" },
    ],
  },
  lab: {
    label: "Lab metrics",
    format: formatMs,
    series: [
      { dataKey: "lcpMs", name: "LCP", color: "#8b5cf6" },
      { dataKey: "tbtMs", name: "TBT", color: "#f59e0b" },
    ],
  },
  field: {
    label: "Field metrics",
    format: formatMs,
    series: [
      { dataKey: "fieldLcpMs", name: "LCP (field)", color: "#8b5cf6" },
      { dataKey: "fieldInpMs", name: "INP (field)", color: "#3b82f6" },
    ],
  },
};

const GROUP_ORDER: MetricGroup[] = ["scores", "lab", "field"];

/** Scores and Core Web Vitals over time for one URL and strategy. */
export function PagespeedTrendChart({
  snapshots,
  strategy,
}: {
  snapshots: readonly PagespeedSnapshotLike[];
  strategy: string;
}) {
  const [group, setGroup] = React.useState<MetricGroup>("scores");
  const { containerRef, width } = useChartWidth();
  const data = React.useMemo(
    () => buildTrendSeries(snapshots, strategy),
    [snapshots, strategy],
  );
  const config = GROUPS[group];

  if (data.length < 2) {
    return (
      <p className="text-sm text-base-content/60">
        {data.length === 0
          ? "No results for this strategy yet."
          : "One result so far — run this URL again to start a trend."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="join">
          {GROUP_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`btn join-item btn-xs ${
                group === key ? "btn-active" : ""
              }`}
              onClick={() => setGroup(key)}
            >
              {GROUPS[key].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
          {config.series.map((series) => (
            <span
              key={series.dataKey}
              className="inline-flex items-center gap-1.5"
            >
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ backgroundColor: series.color }}
              />
              {series.name}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full min-w-0"
        style={{ height: 224 }}
      >
        {width > 0 ? (
          <LineChart
            width={width}
            height={224}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.1}
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDateTick}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              domain={config.domain ?? ["auto", "auto"]}
              tick={{ fontSize: 11 }}
              width={48}
            />
            <Tooltip
              labelFormatter={(value) => formatDateTick(Number(value))}
              formatter={(
                value: number | string | undefined,
                name: string | undefined,
              ) => [
                typeof value === "number"
                  ? group === "scores"
                    ? String(value)
                    : name?.includes("CLS")
                      ? formatCls(value)
                      : config.format(value)
                  : "—",
                name ?? "",
              ]}
            />
            {config.series.map((series) => (
              <Line
                key={series.dataKey}
                type="monotone"
                dataKey={series.dataKey}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                // Field data is missing on plenty of runs; skip the gaps
                // instead of dropping the line to zero.
                connectNulls
              />
            ))}
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}
