import { Line, LineChart } from "recharts";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  formatCompactDate,
  formatMonthLabel,
  formatTooltipValue,
} from "./backlinksPageUtils";

const trendChartConfig = {
  backlinks: { label: "Backlinks", color: "#2563eb" },
  referringDomains: { label: "Referring domains", color: "#14b8a6" },
} satisfies ChartConfig;

const newLostChartConfig = {
  lostBacklinks: { label: "Lost backlinks", color: "#ef4444" },
  newBacklinks: { label: "New backlinks", color: "#16a34a" },
} satisfies ChartConfig;

const tooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        labelFormatter={formatChartLabel}
        valueFormatter={formatTooltipValue}
      />
    }
  />
);

const legend = <ChartLegend content={<ChartLegendContent />} />;

export function BacklinksTrendChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <ChartContainer
      config={trendChartConfig}
      className="h-56"
      aria-label="Backlink trend chart"
    >
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <ChartGrid />
        <ChartXAxis
          dataKey="date"
          tickFormatter={formatChartTick}
          minTickGap={24}
        />
        <ChartYAxis yAxisId="left" tickFormatter={formatAxisValue} width={60} />
        <ChartYAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatAxisValue}
          width={60}
        />
        {tooltip}
        {legend}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="backlinks"
          stroke="var(--color-backlinks)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="referringDomains"
          stroke="var(--color-referringDomains)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function BacklinksNewLostChart({
  data,
}: {
  data: BacklinksOverviewData["newLostTrends"];
}) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <ChartContainer
      config={newLostChartConfig}
      className="h-56"
      aria-label="New and lost backlinks chart"
    >
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <ChartGrid />
        <ChartXAxis
          dataKey="date"
          tickFormatter={formatChartTick}
          minTickGap={24}
        />
        <ChartYAxis tickFormatter={formatAxisValue} width={60} />
        {tooltip}
        {legend}
        <Line
          type="monotone"
          dataKey="lostBacklinks"
          stroke="var(--color-lostBacklinks)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="newBacklinks"
          stroke="var(--color-newBacklinks)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
      Not enough historical data yet.
    </div>
  );
}

function formatAxisValue(value: unknown) {
  if (typeof value !== "number") return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function formatChartTick(value: unknown) {
  return typeof value === "string" ? formatMonthLabel(value) : "";
}

function formatChartLabel(value: unknown) {
  return typeof value === "string" ? formatCompactDate(value) : "";
}
