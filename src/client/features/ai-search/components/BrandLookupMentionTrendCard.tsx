import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCount } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type Props = {
  result: BrandLookupResult;
};

export function BrandLookupMentionTrendCard({ result }: Props) {
  const chartData = useMemo(
    () =>
      result.monthlyVolume.map((entry) => ({
        label: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
        volume: entry.volume ?? 0,
      })),
    [result.monthlyVolume],
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Not enough historical data yet.
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--trend-grid-color)"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--trend-axis-color)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--trend-axis-color)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={<MentionTooltip />}
            cursor={{ stroke: "var(--trend-grid-color)" }}
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MentionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md backdrop-blur-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">
        {formatCount(payload[0].value)} mentions
      </p>
    </div>
  );
}
