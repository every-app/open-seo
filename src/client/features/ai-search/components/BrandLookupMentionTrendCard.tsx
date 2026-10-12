import { useMemo } from "react";
import { Line, LineChart } from "recharts";
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
import { formatCount } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type Props = {
  result: BrandLookupResult;
};

const chartConfig = {
  volume: { label: "Mentions", color: "hsl(220 70% 50%)" },
} satisfies ChartConfig;

export function BrandLookupMentionTrendCard({ result }: Props) {
  const chartData = useMemo(
    () =>
      result.monthlyVolume.map((entry) => ({
        label: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
        volume: entry.volume ?? 0,
      })),
    [result.monthlyVolume],
  );

  return (
    <ChartContainer config={chartConfig} className="h-56">
      <LineChart
        data={chartData}
        margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
      >
        <ChartGrid />
        <ChartXAxis dataKey="label" />
        <ChartYAxis allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              valueFormatter={(value) => formatCount(Number(value))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="volume"
          stroke="var(--color-volume)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
