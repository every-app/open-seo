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
import {
  buildCrawlTiles,
  totalErrors,
  type BingCrawlRow,
  type CrawlTile,
} from "@/client/features/bing/bingCrawlMath";
import { getBingCrawlStats } from "@/serverFunctions/bing";

const SERIES = [
  { dataKey: "crawledPages", name: "Crawled pages", color: "#10b981" },
  { dataKey: "inLinks", name: "Inbound links", color: "#8b5cf6" },
  { dataKey: "inIndex", name: "In index", color: "#3b82f6" },
  {
    dataKey: "errors",
    name: "Errors",
    color: "#ef4444",
    strokeDasharray: "4 3",
  },
] as const;

/**
 * Crawl tab: daily Bingbot activity from GetCrawlStats. A diagnostic panel —
 * InIndex and InLinks should move slowly; a falling InIndex line is the early
 * warning (noindex, robots, sitemap breakage) this tab exists for.
 */
export function BingCrawlPanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["bingCrawlStats", projectId],
    queryFn: () => getBingCrawlStats({ data: { projectId } }),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-base-content/50">
        <span className="loading loading-spinner loading-sm" />
        Loading crawl stats…
      </div>
    );
  }
  if (query.isError || (query.data && !query.data.connected)) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-error">Couldn't load Bing crawl stats.</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const rows: BingCrawlRow[] = query.data?.connected ? query.data.rows : [];
  const tiles = buildCrawlTiles(rows);
  if (!tiles) {
    return (
      <p className="p-6 text-sm text-base-content/60">
        Bing hasn't reported crawl activity for this site yet.
      </p>
    );
  }

  const chartData = rows
    .filter((row): row is BingCrawlRow & { date: string } => row.date !== null)
    .map((row) => ({
      day: new Date(row.date).getTime(),
      crawledPages: row.crawledPages,
      inIndex: row.inIndex,
      inLinks: row.inLinks,
      errors: totalErrors(row),
    }));

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CrawlStatTile
          label="Pages in Bing's index"
          tile={tiles.inIndex}
          deltaTitle="vs ~28 days ago"
        />
        <CrawlStatTile
          label="Inbound links (Bing)"
          tile={tiles.inLinks}
          deltaTitle="vs ~28 days ago"
        />
        <CrawlStatTile
          label="Crawl errors (7 days)"
          tile={{ value: tiles.errors7d, delta: null }}
          alarming={tiles.errors7d > 0}
        />
      </div>

      <CrawlChart data={chartData} />

      <p className="text-xs text-base-content/50">
        Daily Bingbot activity over Bing's fixed reporting window. Errors =
        crawl errors + 4xx + 5xx.
      </p>
    </div>
  );
}

function CrawlStatTile({
  label,
  tile,
  deltaTitle,
  alarming = false,
}: {
  label: string;
  tile: CrawlTile;
  deltaTitle?: string;
  alarming?: boolean;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`text-2xl font-semibold tabular-nums ${alarming ? "text-error" : ""}`}
        >
          {tile.value.toLocaleString()}
        </span>
        {tile.delta !== null && tile.delta !== 0 ? (
          <span
            className={`text-xs ${tile.delta > 0 ? "text-success" : "text-error"}`}
            title={deltaTitle}
          >
            {tile.delta > 0 ? "+" : ""}
            {tile.delta.toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Narrowed shape of a recharts tooltip payload entry (typed `any`
 *  upstream). */
type TooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
};

type ChartRow = {
  day: number;
  crawledPages: number;
  inIndex: number;
  inLinks: number;
  errors: number;
};

function CrawlChart({ data }: { data: ChartRow[] }) {
  const { containerRef, width } = useChartWidth();
  const height = 256;
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
                // recharts types payload entries as `any`; narrow first.
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
                strokeDasharray={
                  "strokeDasharray" in s ? s.strokeDasharray : undefined
                }
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
