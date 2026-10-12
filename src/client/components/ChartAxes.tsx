import type { ComponentProps } from "react";
import { CartesianGrid, XAxis, YAxis } from "recharts";

// Shared grid and axis defaults for charts inside the shadcn ChartContainer.
// ChartContainer colors the grid lines and tick labels from the --trend-*
// variables, so these wrappers set only the shape. Props override defaults.
// The tick font size is a prop, not CSS, because Recharts measures tick labels
// with it to decide which ticks fit.
const TICK = { fontSize: 10 };

export function ChartGrid(props: ComponentProps<typeof CartesianGrid>) {
  return <CartesianGrid strokeDasharray="3 3" vertical={false} {...props} />;
}

export function ChartXAxis(props: ComponentProps<typeof XAxis>) {
  return (
    <XAxis
      tick={TICK}
      tickLine={false}
      axisLine={false}
      minTickGap={32}
      {...props}
    />
  );
}

export function ChartYAxis(props: ComponentProps<typeof YAxis>) {
  return (
    <YAxis
      tick={TICK}
      tickLine={false}
      axisLine={false}
      width={44}
      {...props}
    />
  );
}
