import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CardShell,
  EmptyCardBody,
  formatDay,
  Stat,
} from "@/client/features/dashboard/cardParts";
import {
  formatDateTick,
  useChartWidth,
} from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { cwvRating, type CwvMetricKey } from "@/shared/cwv";
import { getCruxSnapshot } from "@/serverFunctions/crux";

const CHART_HEIGHT = 128;

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function formatCls(value: number): string {
  return value.toFixed(2);
}

/** Lower is better for every Core Web Vital, so the tone is inverted relative
 *  to count metrics (same convention as positionDelta in
 *  SearchPerformanceParts). */
function cwvTone(
  metric: CwvMetricKey,
  p75: number | undefined,
): "success" | "error" | undefined {
  if (p75 == null) return undefined;
  return cwvRating(metric, p75) === "good" ? "success" : "error";
}

function LcpTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  return (
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm">
      <p className="text-xs text-base-content/60">
        Week ending {formatDateTick(label)}
      </p>
      <p className="text-sm font-medium tabular-nums">
        LCP p75 {formatMs(payload[0].value)}
      </p>
    </div>
  );
}

export function CruxCard({
  projectId,
  configured,
}: {
  projectId: string;
  configured: boolean;
}) {
  const snapshotQuery = useQuery({
    queryKey: ["dashboardCruxSnapshot", projectId],
    queryFn: () => getCruxSnapshot({ data: { projectId } }),
    enabled: configured,
  });
  const { containerRef, width: chartWidth } = useChartWidth();

  const result = snapshotQuery.data;
  const lcpTrend = useMemo(
    () =>
      result?.status === "ok"
        ? result.snapshot.history
            .filter((row) => row.lcpMs !== null)
            .map((row) => ({
              weekEnd: Date.parse(`${row.weekEnd}T00:00:00Z`),
              lcpMs: row.lcpMs,
            }))
        : [],
    [result],
  );

  if (!configured) {
    return (
      <CardShell title="Core Web Vitals">
        <EmptyCardBody
          message="Add CRUX_API_KEY to see real-user Core Web Vitals."
          cta={
            <a
              href="https://developer.chrome.com/docs/crux/api"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
            >
              Get an API key
            </a>
          }
        />
      </CardShell>
    );
  }

  if (snapshotQuery.isPending) {
    return (
      <CardShell title="Core Web Vitals">
        <div className="grid grid-cols-3 gap-3" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      </CardShell>
    );
  }

  if (snapshotQuery.isError || !result) {
    return (
      <CardShell title="Core Web Vitals">
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Chrome UX Report data. Try again shortly.
        </p>
      </CardShell>
    );
  }

  if (result.status === "no_data") {
    return (
      <CardShell title="Core Web Vitals">
        <p className="text-sm text-base-content/60">
          No field data yet — Chrome hasn&rsquo;t collected enough real-user
          samples for this origin.
        </p>
      </CardShell>
    );
  }

  const { record } = result.snapshot;

  return (
    <CardShell
      title="Core Web Vitals"
      stamp={`Chrome UX Report · 28-day rolling${
        record.collectionPeriod
          ? ` · ${formatDay(record.collectionPeriod.lastDate)}`
          : ""
      }`}
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="LCP"
          value={record.lcpMs ? formatMs(record.lcpMs.p75) : "—"}
          tone={cwvTone("lcpMs", record.lcpMs?.p75)}
        />
        <Stat
          label="INP"
          value={record.inpMs ? formatMs(record.inpMs.p75) : "—"}
          tone={cwvTone("inpMs", record.inpMs?.p75)}
        />
        <Stat
          label="CLS"
          value={record.cls ? formatCls(record.cls.p75) : "—"}
          tone={cwvTone("cls", record.cls?.p75)}
        />
      </div>
      {lcpTrend.length > 1 ? (
        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-base-content/50">
            <span>Weekly LCP p75</span>
            <span className="inline-flex items-center gap-1">
              Better <span aria-hidden>↓</span>
            </span>
          </div>
          <div
            ref={containerRef}
            className="w-full min-w-0"
            style={{ height: CHART_HEIGHT }}
          >
            {chartWidth > 0 ? (
              <LineChart
                width={chartWidth}
                height={CHART_HEIGHT}
                data={lcpTrend}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  opacity={0.1}
                  vertical={false}
                />
                <XAxis
                  dataKey="weekEnd"
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
                  tickFormatter={(value: number) => formatMs(value)}
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  content={<LcpTooltip />}
                  cursor={{ stroke: "rgba(150,150,150,0.3)" }}
                />
                <Line
                  type="monotone"
                  dataKey="lcpMs"
                  name="LCP p75"
                  stroke="hsl(220 70% 50%)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : null}
          </div>
        </div>
      ) : null}
    </CardShell>
  );
}
