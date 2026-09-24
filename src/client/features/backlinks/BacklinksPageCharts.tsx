import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  formatCompactDate,
  formatMonthLabel,
  formatTooltipValue,
} from "./backlinksPageUtils";

const AXIS_TICK = { fill: "var(--trend-axis-color)", fontSize: 11 };

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "var(--trend-tooltip-bg)",
  border: "1px solid var(--trend-tooltip-border)",
  borderRadius: "10px",
  boxShadow: "0 8px 24px var(--trend-tooltip-shadow)",
  color: "var(--foreground)",
};

// Legend text defaults to the series colour, which is too dim to read on the
// dark card; the swatch beside it already carries the colour.
function renderLegendLabel(value: unknown) {
  return <span className="text-foreground">{String(value)}</span>;
}

export function BacklinksTrendChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  const { containerRef, chartWidth } = useChartWidth();

  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div
      ref={containerRef}
      className="h-56 min-w-0"
      aria-label="Backlink trend chart"
    >
      {chartWidth > 0 ? (
        <LineChart
          width={chartWidth}
          height={224}
          data={data}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--trend-grid-color)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            minTickGap={24}
            stroke="var(--trend-grid-color)"
            tick={AXIS_TICK}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatAxisValue}
            width={60}
            stroke="var(--trend-grid-color)"
            tick={AXIS_TICK}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatAxisValue}
            width={60}
            stroke="var(--trend-grid-color)"
            tick={AXIS_TICK}
          />
          <Tooltip
            formatter={formatTooltipValue}
            labelFormatter={formatChartLabel}
            contentStyle={TOOLTIP_CONTENT_STYLE}
          />
          <Legend formatter={renderLegendLabel} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="backlinks"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            name="Backlinks"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="referringDomains"
            stroke="var(--signature)"
            strokeWidth={2}
            dot={false}
            name="Referring domains"
          />
        </LineChart>
      ) : null}
    </div>
  );
}

export function BacklinksNewLostChart({
  data,
}: {
  data: BacklinksOverviewData["newLostTrends"];
}) {
  const { containerRef, chartWidth } = useChartWidth();

  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div
      ref={containerRef}
      className="h-56 min-w-0"
      aria-label="New and lost backlinks chart"
    >
      {chartWidth > 0 ? (
        <LineChart
          width={chartWidth}
          height={224}
          data={data}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--trend-grid-color)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            minTickGap={24}
            stroke="var(--trend-grid-color)"
            tick={AXIS_TICK}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            width={60}
            stroke="var(--trend-grid-color)"
            tick={AXIS_TICK}
          />
          <Tooltip
            formatter={formatTooltipValue}
            labelFormatter={formatChartLabel}
            contentStyle={TOOLTIP_CONTENT_STYLE}
          />
          <Legend formatter={renderLegendLabel} />
          <Line
            type="monotone"
            dataKey="lostBacklinks"
            stroke="var(--destructive)"
            strokeWidth={2}
            dot={false}
            name="Lost backlinks"
          />
          <Line
            type="monotone"
            dataKey="newBacklinks"
            stroke="var(--success)"
            strokeWidth={2}
            dot={false}
            name="New backlinks"
          />
        </LineChart>
      ) : null}
    </div>
  );
}

function useChartWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setChartWidth(container.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, chartWidth };
}

function EmptyChartState() {
  return (
    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
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
