import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sortBy } from "remeda";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlySearch } from "@/types/keywords";
import { formatNumber } from "../utils";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

export type SortField =
  | "keyword"
  | "searchVolume"
  | "cpc"
  | "competition"
  | "keywordDifficulty";
export type SortDir = "asc" | "desc";

export function HeaderHelpLabel({
  label,
  helpText,
  delayMs = 150,
}: {
  label: string;
  helpText: string;
  delayMs?: number;
}) {
  const tooltip = useFloatingTooltip<HTMLSpanElement>({ delayMs });

  return (
    <span
      ref={tooltip.triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={tooltip.scheduleOpen}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.scheduleOpen}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
      aria-describedby={tooltip.isOpen ? tooltip.tooltipId : undefined}
    >
      <span>{label}</span>
      {tooltip.isOpen && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              {helpText}
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </span>
  );
}

export function AreaTrendChart({ trend }: { trend: MonthlySearch[] }) {
  const sorted = sortBy(trend, (item) => item.year * 100 + item.month);
  const last12 = sorted.slice(-12);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  if (last12.length === 0) return null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      setChartWidth(container.clientWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const data = last12.map((m) => ({
    month: monthLabels[m.month - 1],
    year: m.year,
    searchVolume: m.searchVolume,
    label: `${monthLabels[m.month - 1]} ${m.year}`,
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-[210px] min-w-0"
      aria-label="Search trend chart"
    >
      {chartWidth > 0 ? (
        <AreaChart
          width={chartWidth}
          height={210}
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="var(--trend-fill-start-opacity)"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="var(--trend-fill-end-opacity)"
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--trend-grid-color)"
            strokeDasharray="2 4"
            vertical={true}
            horizontal={true}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--trend-axis-color)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number | string) =>
              formatNumber(Number(value))
            }
            tick={{ fill: "var(--trend-axis-color)", fontSize: 11 }}
            width={56}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--trend-tooltip-bg)",
              border: "1px solid var(--trend-tooltip-border)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px var(--trend-tooltip-shadow)",
              color: "var(--color-base-content)",
            }}
          />
          <Area
            type="monotone"
            dataKey="searchVolume"
            name="Search volume"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#trendGrad)"
            isAnimationActive={false}
            dot={{ r: 3, fill: "var(--color-primary)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--color-primary)" }}
          />
        </AreaChart>
      ) : null}
    </div>
  );
}

export function SortHeader({
  label,
  helpText,
  field,
  current,
  dir,
  onToggle,
  className,
}: {
  label: string;
  helpText?: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onToggle: (f: SortField) => void;
  className?: string;
}) {
  const isActive = field === current;
  const tooltip = useFloatingTooltip<HTMLButtonElement>({
    enabled: !!helpText,
  });

  return (
    <button
      ref={tooltip.triggerRef}
      className={`inline-flex items-center gap-0.5 hover:text-primary transition-colors cursor-pointer select-none ${className ?? ""}`}
      onClick={() => onToggle(field)}
      onMouseEnter={tooltip.scheduleOpen}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.scheduleOpen}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
      aria-describedby={
        tooltip.isOpen && helpText ? tooltip.tooltipId : undefined
      }
    >
      {label}
      {isActive &&
        (dir === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        ))}
      {tooltip.isOpen && helpText && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              {helpText}
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </button>
  );
}
