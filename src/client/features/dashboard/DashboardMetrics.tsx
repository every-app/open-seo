import { Line, LineChart, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";

function changeClass(change: number | null): string {
  if (!change) return "text-muted-foreground";
  // The --success and --destructive tokens are too light for small text on a
  // white card.
  return change > 0
    ? "text-green-700 dark:text-success"
    : "text-red-700 dark:text-destructive";
}

function changeLabel(change: number | null): string {
  if (change === null) return "—";
  return `${change > 0 ? "+" : ""}${change}%`;
}

/** Headline numbers with a quiet label above and the change below. A dot ties a
 *  metric to its line in the chart beneath it. */
export function MetricRow({
  metrics,
}: {
  metrics: {
    label: string;
    value: string;
    change: number | null;
    dotClass?: string;
  }[];
}) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-3">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {metric.label}
            {metric.dotClass ? (
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", metric.dotClass)}
              />
            ) : null}
          </dt>
          <dd className="mt-1 text-xl leading-7 font-semibold tabular-nums">
            {metric.value}
          </dd>
          <dd
            className={cn("text-xs tabular-nums", changeClass(metric.change))}
          >
            {changeLabel(metric.change)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
      <Skeleton className="min-h-28 flex-1" />
    </div>
  );
}

function formatTrendDay(date: string): string {
  // Construct in local time: Date.parse("2026-08-01") is UTC midnight, which
  // toLocaleDateString would render as the previous day west of Greenwich.
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * One line per key of `config`, each on its own hidden scale so a small series
 * stays readable beside a large one. Exact values are in the tooltip. It fills
 * the height left in the card, so side-by-side cards stay level.
 */
export function TrendChart({
  config,
  data,
}: {
  config: ChartConfig;
  data: Record<string, string | number>[];
}) {
  const series = Object.keys(config);
  return (
    <div className="relative min-h-28 flex-1">
      <ChartContainer config={config} className="absolute inset-0">
        <LineChart
          data={data}
          margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
        >
          <XAxis dataKey="date" hide />
          {series.map((key) => (
            <YAxis key={key} yAxisId={key} hide domain={[0, "auto"]} />
          ))}
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
          {series.map((key) => (
            <Line
              key={key}
              yAxisId={key}
              dataKey={key}
              type="linear"
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
