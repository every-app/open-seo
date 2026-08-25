import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CardShell,
  moreDetailsClass,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { Ga4ConnectCard } from "@/client/features/dashboard/Ga4ConnectCard";
import {
  formatCount,
  formatCtr,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getGa4DashboardReport } from "@/serverFunctions/ga4";

function formatTrendDay(date: string): string {
  // Construct in local time: Date.parse("2026-08-01") is UTC midnight, which
  // toLocaleDateString would render as the previous day west of Greenwich.
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statValue(
  value: number | null,
  format: (value: number) => string,
): string {
  return value === null ? "—" : format(value);
}

function statDelta(current: number | null, previous: number | null) {
  return current !== null && previous !== null ? (
    <PercentDelta current={current} previous={previous} />
  ) : undefined;
}

function SessionsTooltip({
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
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm">
      <p className="text-xs text-base-content/60">
        {label ? formatTrendDay(label) : ""}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {formatCount(payload[0].value)} sessions
      </p>
    </div>
  );
}

export function Ga4Card({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const reportQuery = useQuery({
    queryKey: ["dashboardGa4Report", projectId],
    queryFn: () => getGa4DashboardReport({ data: { projectId } }),
    enabled: connected,
  });

  // Not connected (or a dead grant discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (reportQuery.data && !reportQuery.data.connected)) {
    return <Ga4ConnectCard projectId={projectId} connected={connected} />;
  }

  const report = reportQuery.data;

  return (
    <CardShell
      title="Organic traffic"
      stamp="Google Analytics · last 28 days"
      action={
        <Link
          to="/p/$projectId/settings"
          params={{ projectId }}
          hash="google-analytics"
          className={moreDetailsClass}
        >
          Manage
        </Link>
      }
    >
      {reportQuery.isPending ? (
        <div className="space-y-3" aria-busy>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
          <div className="skeleton h-24" />
        </div>
      ) : reportQuery.isError ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Google Analytics data. Try again shortly.
        </p>
      ) : report?.connected ? (
        // Covers null (no report row) and 0: a zero-session period would
        // otherwise render an all-zero flatline chart in an empty box.
        !report.totals.sessions ? (
          <p className="text-sm text-base-content/60">
            No organic search traffic recorded in the last 28 days yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Sessions"
                value={statValue(report.totals.sessions, formatCount)}
                sub={statDelta(
                  report.totals.sessions,
                  report.prevTotals.sessions,
                )}
              />
              <Stat
                label="Active users"
                value={statValue(report.totals.activeUsers, formatCount)}
                sub={statDelta(
                  report.totals.activeUsers,
                  report.prevTotals.activeUsers,
                )}
              />
              <Stat
                label="Engagement rate"
                value={statValue(report.totals.engagementRate, formatCtr)}
              />
              <Stat
                label="Key events"
                value={statValue(report.totals.keyEvents, formatCount)}
                sub={statDelta(
                  report.totals.keyEvents,
                  report.prevTotals.keyEvents,
                )}
              />
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={report.trend}
                  margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip
                    content={<SessionsTooltip />}
                    cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    fill="var(--color-primary)"
                    fillOpacity={0.08}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      ) : null}
    </CardShell>
  );
}
