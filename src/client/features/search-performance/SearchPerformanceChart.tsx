import { useState } from "react";
import { Line, LineChart } from "recharts";
import { Check } from "lucide-react";
import { cn } from "cn";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import {
  changeClass,
  formatCount,
  formatCtr,
  formatPosition,
  type Report,
} from "@/client/features/search-performance/SearchPerformanceColumns";

type SearchMetric = "clicks" | "impressions" | "ctr" | "position";

type Totals = Report["totals"];
type TrendDay = Report["trend"][number];

const METRICS: {
  key: SearchMetric;
  label: string;
  bgClass: string;
  borderClass: string;
  format: (value: number) => string;
}[] = [
  {
    key: "clicks",
    label: "Clicks",
    bgClass: "bg-chart-1",
    borderClass: "border-chart-1",
    format: formatCount,
  },
  {
    key: "impressions",
    label: "Impressions",
    bgClass: "bg-chart-2",
    borderClass: "border-chart-2",
    format: formatCount,
  },
  {
    key: "ctr",
    label: "Click-through rate",
    bgClass: "bg-chart-3",
    borderClass: "border-chart-3",
    format: formatCtr,
  },
  {
    key: "position",
    label: "Average position",
    bgClass: "bg-chart-4",
    borderClass: "border-chart-4",
    format: formatPosition,
  },
];

const chartConfig = {
  clicks: { label: "Clicks", color: "var(--chart-1)" },
  impressions: { label: "Impressions", color: "var(--chart-2)" },
  ctr: { label: "Click-through rate", color: "var(--chart-3)" },
  position: { label: "Average position", color: "var(--chart-4)" },
  previous: { label: "Previous period" },
} satisfies ChartConfig;

/** Change against the previous period. Position falls as rankings improve, so
 *  its change is inverted. Null when there is nothing to compare with. */
function metricChange(
  metric: SearchMetric,
  current: number,
  previous: number,
): { text: string; improved: boolean } | null {
  if (previous <= 0) return null;
  if (metric === "position") {
    if (current <= 0) return null;
    const change = previous - current;
    return {
      text: `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}`,
      improved: change >= 0,
    };
  }
  const change = ((current - previous) / previous) * 100;
  return {
    text: `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`,
    improved: change >= 0,
  };
}

function formatDay(date: string): string {
  // Construct in local time: Date.parse("2026-08-01") is UTC midnight, which
  // toLocaleDateString would render as the previous day west of Greenwich.
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Position has no value on a day without impressions. The line skips those
 *  days, and a lone day with a value needs a dot to be seen at all. */
function hasOnePoint(
  data: Partial<Record<SearchMetric | "previous", number | null>>[],
  key: SearchMetric | "previous",
): boolean {
  return data.filter((day) => day[key] != null).length === 1;
}

function formatAxisTick(metric: SearchMetric, value: number): string {
  if (metric === "ctr") return `${(value * 100).toFixed(1)}%`;
  if (metric === "position") return String(Math.round(value));
  return formatCount(value);
}

/**
 * The headline metrics as toggles for one chart. Each line has its own scale,
 * so a small series stays readable beside a large one. With a single metric
 * on, the chart shows its value axis and the previous period as a dashed line.
 */
export function SearchPerformanceChart({
  totals,
  prevTotals,
  trend,
  prevTrend,
  showPosition,
  initialMetrics = ["clicks", "impressions"],
  chartClassName = "h-56",
}: {
  totals: Totals;
  prevTotals: Totals;
  trend: TrendDay[];
  prevTrend: TrendDay[];
  /** Discover and Google News report no position. */
  showPosition: boolean;
  initialMetrics?: SearchMetric[];
  chartClassName?: string;
}) {
  const [active, setActive] = useState(initialMetrics);
  const metrics = METRICS.filter(
    (metric) => showPosition || metric.key !== "position",
  );
  const shown = metrics.filter((metric) => active.includes(metric.key));
  const single = shown.length === 1 ? shown[0] : null;

  const toggle = (key: SearchMetric) =>
    setActive((current) => {
      if (!current.includes(key)) return [...current, key];
      // Keep one metric on, or the chart would be empty.
      return current.length > 1
        ? current.filter((item) => item !== key)
        : current;
    });

  // Both periods have the same number of days, so they pair up by index.
  const data = trend.map((day, index) => ({
    ...day,
    previous: single ? prevTrend[index]?.[single.key] : undefined,
  }));

  return (
    <div className="@container flex flex-col gap-4">
      <div className="-mx-2 grid grid-cols-2 gap-1 @3xl:grid-cols-4">
        {metrics.map((metric) => {
          const isOn = active.includes(metric.key);
          const change = metricChange(
            metric.key,
            totals[metric.key],
            prevTotals[metric.key],
          );
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={isOn}
              onClick={() => toggle(metric.key)}
              className={cn(
                "rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isOn ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.03]",
              )}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                    isOn && [metric.bgClass, metric.borderClass],
                  )}
                >
                  {isOn ? (
                    <Check className="size-2.5 text-white" strokeWidth={3.5} />
                  ) : null}
                </span>
                {metric.label}
              </span>
              <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="text-xl leading-7 font-semibold tabular-nums">
                  {/* Without impressions there is no position to average. */}
                  {metric.key === "position" && totals.position <= 0
                    ? "—"
                    : metric.format(totals[metric.key])}
                </span>
                {change ? (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      changeClass(change.improved),
                    )}
                  >
                    {change.text}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto w-full", chartClassName)}
      >
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: single ? 0 : 8 }}
        >
          <ChartGrid />
          <ChartXAxis dataKey="date" tickFormatter={formatDay} />
          {shown.map((metric) => (
            <ChartYAxis
              key={metric.key}
              yAxisId={metric.key}
              hide={!single}
              // Whole-number ticks, or a narrow range repeats a rounded label.
              allowDecimals={metric.key === "ctr"}
              reversed={metric.key === "position"}
              // Position 1 is the best rank, so its axis never reaches 0.
              domain={
                metric.key === "position"
                  ? [
                      (min: number) => Math.max(1, Math.floor(min - 1)),
                      (max: number) => Math.ceil(max + 1),
                    ]
                  : [0, "auto"]
              }
              tickFormatter={(value: number) =>
                formatAxisTick(metric.key, value)
              }
            />
          ))}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label: unknown) =>
                  typeof label === "string" ? formatDay(label) : ""
                }
                valueFormatter={(value, item) => {
                  const metric =
                    item.dataKey === "previous"
                      ? single
                      : METRICS.find((entry) => entry.key === item.dataKey);
                  return (metric?.format ?? formatCount)(Number(value));
                }}
              />
            }
          />
          {single ? (
            <Line
              yAxisId={single.key}
              dataKey="previous"
              type="linear"
              stroke={`var(--color-${single.key})`}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              connectNulls
              dot={hasOnePoint(data, "previous")}
              isAnimationActive={false}
            />
          ) : null}
          {shown.map((metric) => (
            <Line
              key={metric.key}
              yAxisId={metric.key}
              dataKey={metric.key}
              type="linear"
              stroke={`var(--color-${metric.key})`}
              strokeWidth={2}
              connectNulls
              dot={hasOnePoint(data, metric.key)}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      {single ? (
        <p className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-0.5 w-4 rounded-full", single.bgClass)}
            />
            This period
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "h-0 w-4 border-t-2 border-dashed opacity-60",
                single.borderClass,
              )}
            />
            Previous period
          </span>
        </p>
      ) : null}
    </div>
  );
}
