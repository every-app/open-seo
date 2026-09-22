import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { positionBuckets, trafficTrend } from "./demoData";
import { OverviewChartTooltip, OverviewPanel } from "./OverviewPanel";

export function GrowthPanels() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
      <OverviewPanel
        title="Organic growth trend"
        eyebrow="Visibility + traffic"
        action={
          <span className="text-xs text-base-content/45">Last 28 days</span>
        }
      >
        <div className="p-5">
          <div className="mb-5 flex flex-wrap gap-5 text-xs text-base-content/55">
            <span className="flex items-center gap-2">
              <i className="size-2 rounded-full bg-emerald-400" /> Organic
              traffic
            </span>
            <span className="flex items-center gap-2">
              <i className="size-2 rounded-full bg-cyan-400" /> Visibility %
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 640, height: 256 }}
            >
              <AreaChart
                data={trafficTrend}
                margin={{ top: 8, right: 6, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.45 }}
                />
                <YAxis
                  yAxisId="traffic"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.4 }}
                />
                <YAxis
                  yAxisId="visibility"
                  orientation="right"
                  hide
                  domain={[0, 100]}
                />
                <Tooltip
                  content={<OverviewChartTooltip />}
                  cursor={{ stroke: "currentColor", strokeOpacity: 0.12 }}
                />
                <Area
                  yAxisId="traffic"
                  type="monotone"
                  dataKey="traffic"
                  name="Traffic"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  fill="url(#trafficFill)"
                />
                <Area
                  yAxisId="visibility"
                  type="monotone"
                  dataKey="visibility"
                  name="Visibility"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="transparent"
                  strokeDasharray="5 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </OverviewPanel>

      <OverviewPanel title="Search position spread" eyebrow="1,284 keywords">
        <div className="p-5">
          <div className="h-48">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 192 }}
            >
              <BarChart
                data={positionBuckets}
                margin={{ top: 5, right: 0, left: -30, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.4 }}
                />
                <Tooltip
                  content={<OverviewChartTooltip />}
                  cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                />
                <Bar dataKey="value" name="Keywords" radius={[7, 7, 2, 2]}>
                  {positionBuckets.map((item) => (
                    <Cell key={item.label} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-success/10 p-3">
              <p className="text-xs text-base-content/50">Improved</p>
              <p className="mt-1 font-semibold text-success">128 keywords</p>
            </div>
            <div className="rounded-xl bg-error/10 p-3">
              <p className="text-xs text-base-content/50">Declined</p>
              <p className="mt-1 font-semibold text-error">34 keywords</p>
            </div>
          </div>
        </div>
      </OverviewPanel>
    </div>
  );
}
