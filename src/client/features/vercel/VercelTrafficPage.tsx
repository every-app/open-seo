import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  formatDateTick,
  useChartWidth,
} from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { VercelConnectionCard } from "@/client/features/vercel/VercelConnectionCard";
import { VercelEventsTable } from "@/client/features/vercel/VercelEventsTable";
import {
  isSearchReferrer,
  isAiReferrer,
  referrerLabel,
} from "@/client/features/vercel/referrerKind";
import { trimTrailingPartialDay } from "@/client/features/vercel/trimPartialDay";
import { getVercelTraffic } from "@/serverFunctions/vercel";

type AggRow = { key: string; visitors: number; pageviews: number };

const SERIES = [
  { dataKey: "pageviews", name: "Page views", color: "#8b5cf6" },
  { dataKey: "visitors", name: "Visitors", color: "#3b82f6" },
] as const;

/**
 * Vercel Web Analytics traffic for the project's connected Vercel project:
 * exact 30-day-vs-prior-30-day tiles, a daily chart, referrers (with search
 * engines and AI assistants badged), and top pages. See specs/0010.
 */
export function VercelTrafficPage({ projectId }: { projectId: string }) {
  const trafficQuery = useQuery({
    queryKey: ["vercelTraffic", projectId],
    queryFn: () => getVercelTraffic({ data: { projectId } }),
  });
  const data = trafficQuery.data;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Traffic</h1>
        <p className="mt-1 text-sm text-base-content/60">
          Visitors, referrers, and top pages from Vercel Web Analytics.
        </p>
      </div>

      {trafficQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Loading traffic…
        </div>
      ) : trafficQuery.isError ? (
        <div className="space-y-3">
          <p className="text-sm text-error">Couldn't load traffic.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void trafficQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !data?.connected ? (
        <div className="max-w-2xl">
          <VercelConnectionCard projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-base-content/60">
            <span className="font-mono">{data.vercelProjectName}</span>
            <span>
              {data.range.since} to {data.range.until} vs prior 30 days
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
            <StatTile
              label="Visitors"
              value={data.totals.visitors}
              previous={data.prevTotals.visitors}
            />
            <StatTile
              label="Page views"
              value={data.totals.pageviews}
              previous={data.prevTotals.pageviews}
            />
          </div>

          <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <TrafficChart daily={data.daily} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
              <h2 className="border-b border-base-300 p-4 text-sm font-semibold">
                Referrers
              </h2>
              <ReferrerTable rows={data.referrers} />
            </section>
            <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
              <h2 className="border-b border-base-300 p-4 text-sm font-semibold">
                Top pages
              </h2>
              <PagesTable rows={data.pages} />
            </section>
          </div>

          {data.events.length > 0 ? (
            <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm lg:max-w-2xl">
              <h2 className="border-b border-base-300 p-4 text-sm font-semibold">
                Events
              </h2>
              <VercelEventsTable
                rows={data.events}
                prevRows={data.prevEvents}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  previous,
}: {
  label: string;
  value: number;
  previous: number;
}) {
  const delta =
    previous > 0 ? (((value - previous) / previous) * 100).toFixed(1) : null;
  const improved = value >= previous;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {formatCount(value)}
        </span>
        {delta !== null ? (
          <span
            className={`text-xs ${improved ? "text-success" : "text-error"}`}
            title="vs the prior 30 days"
          >
            {improved ? "+" : ""}
            {delta}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
};

function TrafficChart({ daily }: { daily: AggRow[] }) {
  const { containerRef, width } = useChartWidth();
  const height = 224;
  // Tiles include today; the chart doesn't — the always-partial current day
  // renders as a misleading cliff to zero at the right edge.
  const data = trimTrailingPartialDay(daily, new Date()).map((row) => ({
    day: new Date(row.key).getTime(),
    visitors: row.visitors,
    pageviews: row.pageviews,
  }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
        {SERIES.map((s) => (
          <span key={s.dataKey} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
        {width > 0 ? (
          <LineChart
            width={width}
            height={height}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.1}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDateTick}
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              content={(props: TooltipContentProps<number, string>) => {
                const { active, payload, label } = props;
                if (!active || !payload?.length || typeof label !== "number") {
                  return null;
                }
                const entries = payload.map((p: TooltipEntry) => ({
                  key: String(p.dataKey),
                  name: p.name,
                  color: p.color,
                  value: typeof p.value === "number" ? p.value : null,
                }));
                return (
                  <div className="rounded-lg border border-base-300 bg-base-100 p-2 text-xs shadow">
                    <p className="mb-1 font-medium">{formatDateTick(label)}</p>
                    {entries.map((entry) => (
                      <p key={entry.key} className="tabular-nums">
                        <span style={{ color: entry.color }}>{entry.name}</span>
                        : {entry.value ?? "–"}
                      </p>
                    ))}
                  </div>
                );
              }}
              cursor={{ stroke: "rgba(150,150,150,0.3)" }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}

function ReferrerTable({ rows }: { rows: AggRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-base-content/60">No referrer data yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Source</th>
            <th className="text-right">Visitors</th>
            <th className="text-right">Page views</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || "(direct)"}>
              <td className="max-w-xs">
                <span className="flex items-center gap-2">
                  <span className="truncate">{referrerLabel(row.key)}</span>
                  {isSearchReferrer(row.key) ? (
                    <span className="badge badge-ghost badge-xs shrink-0">
                      search
                    </span>
                  ) : isAiReferrer(row.key) ? (
                    <span className="badge badge-primary badge-outline badge-xs shrink-0">
                      AI
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.visitors)}
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.pageviews)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PagesTable({ rows }: { rows: AggRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-base-content/60">No page data yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Path</th>
            <th className="text-right">Visitors</th>
            <th className="text-right">Page views</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="max-w-xs">
                <span className="block truncate" title={row.key}>
                  {row.key}
                </span>
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.visitors)}
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.pageviews)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
