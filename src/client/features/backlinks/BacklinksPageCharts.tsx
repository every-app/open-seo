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
  formatFullDate,
  formatMonthLabel,
  formatTooltipValue,
} from "./backlinksPageUtils";

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
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            minTickGap={24}
          />
          <YAxis />
          <Tooltip
            formatter={formatTooltipValue}
            labelFormatter={formatChartLabel}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="backlinks"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            name="Backlinks"
          />
          <Line
            type="monotone"
            dataKey="referringDomains"
            stroke="#14b8a6"
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
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            minTickGap={24}
          />
          <YAxis />
          <Tooltip
            formatter={formatTooltipValue}
            labelFormatter={formatChartLabel}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="newBacklinks"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
            name="New backlinks"
          />
          <Line
            type="monotone"
            dataKey="lostBacklinks"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            name="Lost backlinks"
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
    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-base-300 text-sm text-base-content/55">
      Not enough historical data yet.
    </div>
  );
}

function formatChartTick(value: unknown) {
  return typeof value === "string" ? formatMonthLabel(value) : "";
}

function formatChartLabel(value: unknown) {
  return typeof value === "string" ? formatFullDate(value) : "";
}
