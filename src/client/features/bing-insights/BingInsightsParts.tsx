import { Line, LineChart } from "recharts";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import type {
  BingCoverage,
  BingSiteSummary,
} from "@/server/features/bing/bingPerformance";
import type { BingTrafficRow } from "@/server/lib/bingClient";

const trendChartConfig = {
  impressions: { label: "Impressions", color: "#2563eb" },
  clicks: { label: "Clicks", color: "#14b8a6" },
} satisfies ChartConfig;

/** Daily whole-site clicks and impressions across Bing's window — the trend
 *  the Bing web UI shows above its performance report. Impressions and clicks
 *  differ by orders of magnitude, so they get their own axes. */
function BingTrendChart({ data }: { data: BingTrafficRow[] }) {
  if (data.length < 2) return null;
  return (
    <ChartContainer
      config={trendChartConfig}
      className="h-56 w-full"
      aria-label="Bing daily site traffic"
    >
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <ChartGrid />
        <ChartXAxis
          dataKey="date"
          tickFormatter={formatDayTick}
          minTickGap={24}
        />
        <ChartYAxis yAxisId="left" tickFormatter={formatAxis} width={56} />
        <ChartYAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatAxis}
          width={56}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="impressions"
          stroke="var(--color-impressions)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="clicks"
          stroke="var(--color-clicks)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function formatDayTick(value: unknown) {
  return typeof value === "string" ? value.slice(5) : "";
}

function formatAxis(value: unknown) {
  if (typeof value !== "number") return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

/** The connected site and its whole-site stat tiles. Its own query means it
 *  paints the moment Bing's traffic endpoint answers, without waiting on the
 *  (heavier) table rows. */
export function BingSummary({
  pending,
  summary,
  siteUrl,
  coverage,
  trend,
}: {
  pending: boolean;
  summary: BingSiteSummary | null;
  siteUrl?: string;
  coverage?: BingCoverage;
  trend: BingTrafficRow[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{siteUrl}</span>
        {coverage?.startDate && coverage.endDate ? (
          <>
            <span>·</span>
            <Badge variant="outline" className="font-normal">
              {coverage.startDate} → {coverage.endDate} ({coverage.days} days,{" "}
              {coverage.timeZone})
            </Badge>
          </>
        ) : null}
      </div>

      {pending ? (
        <div
          className="w-full max-w-xl rounded-xl border border-border bg-card p-4"
          aria-busy
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mb-2 h-6 last:mb-0" />
          ))}
        </div>
      ) : (
        <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  {
                    label: "Clicks",
                    value: summary ? formatCount(summary.clicks) : "—",
                  },
                  {
                    label: "Impressions",
                    value: summary ? formatCount(summary.impressions) : "—",
                  },
                  {
                    label: "Click-through rate",
                    value: summary ? formatCtr(summary.ctr) : "—",
                  },
                  {
                    label: "Average position",
                    value:
                      summary?.position === undefined
                        ? "—"
                        : formatPosition(summary.position),
                  },
                ] satisfies { label: string; value: string }[]
              ).map((metric) => (
                <TableRow key={metric.label}>
                  <TableCell>{metric.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metric.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!pending && trend.length >= 2 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <BingTrendChart data={trend} />
        </div>
      ) : null}
    </>
  );
}

/** The table's filter panel. Bing's API offers no device, country, or date
 *  filter, so the note says so rather than showing controls that do nothing. */
export function BingFilterBar({
  showFilters,
  entity,
  queryFilter,
  onQueryFilterChange,
  minImpressions,
  onMinImpressionsChange,
  onClearFilters,
  activeFilterCount,
}: {
  showFilters: boolean;
  entity: "queries" | "pages";
  queryFilter: string;
  onQueryFilterChange: (value: string) => void;
  minImpressions: string;
  onMinImpressionsChange: (value: string) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}) {
  if (!showFilters) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Search</span>
        <Input
          type="text"
          className="h-8 w-48 bg-background"
          placeholder={`Filter ${entity}...`}
          value={queryFilter}
          onChange={(event) => onQueryFilterChange(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Min impressions</span>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          className="h-8 w-28 bg-background"
          placeholder="0"
          value={minImpressions}
          onChange={(event) => onMinImpressionsChange(event.target.value)}
        />
      </div>
      {activeFilterCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      ) : null}
      <p className="w-full text-xs text-muted-foreground">
        Bing&rsquo;s API returns one fixed window (about three months) with no
        device or country breakdown, so only the filters it supports are offered
        here.
      </p>
    </div>
  );
}
