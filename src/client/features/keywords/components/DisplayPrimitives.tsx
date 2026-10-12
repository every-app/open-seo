import { Area, AreaChart } from "recharts";
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
import type { MonthlySearch } from "@/types/keywords";
import {
  formatCompactNumber,
  lastTwelveMonths,
  MONTH_SHORT_LABELS,
} from "../utils";

export type SortField =
  | "keyword"
  | "searchVolume"
  | "cpc"
  | "competition"
  | "keywordDifficulty";
export type SortDir = "asc" | "desc";

export function AreaTrendChart({
  trend,
  label = "Search volume",
}: {
  trend: MonthlySearch[];
  label?: string;
}) {
  const last12 = lastTwelveMonths(trend);
  if (last12.length === 0) return null;

  const data = last12.map((m) => ({
    month: MONTH_SHORT_LABELS[m.month - 1],
    searchVolume: m.searchVolume,
  }));

  return (
    <ChartContainer
      config={
        {
          searchVolume: { label, color: "var(--color-primary)" },
        } satisfies ChartConfig
      }
      className="h-[210px]"
      aria-label={`${label} trend chart`}
    >
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
        accessibilityLayer
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-searchVolume)"
              stopOpacity="var(--trend-fill-start-opacity)"
            />
            <stop
              offset="100%"
              stopColor="var(--color-searchVolume)"
              stopOpacity="var(--trend-fill-end-opacity)"
            />
          </linearGradient>
        </defs>
        <ChartGrid />
        <ChartXAxis dataKey="month" minTickGap={5} />
        <ChartYAxis
          tickFormatter={(value: number | string) =>
            formatCompactNumber(Number(value))
          }
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="searchVolume"
          stroke="var(--color-searchVolume)"
          strokeWidth={2}
          fill="url(#trendGrad)"
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-searchVolume)", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "var(--color-searchVolume)" }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
