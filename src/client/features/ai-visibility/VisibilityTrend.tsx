import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { getAiVisibilityTrend } from "@/serverFunctions/ai-visibility";
import type { AiTrend, AiTrendMetric } from "@/shared/ai-visibility";
import { EngineLabel } from "./EngineLabel";
import { trendSeries, VisibilityTrendChart } from "./VisibilityTrendChart";
import { AiQueryError, aiVisibilityKey } from "./shared";

const periods = [
  { value: "7", icon: null, label: "7d" },
  { value: "28", icon: null, label: "28d" },
  { value: "90", icon: null, label: "90d" },
];

const rate = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;

function notice(trend: AiTrend, collecting: boolean) {
  const { days } = trend;
  switch (trend.comparison) {
    case "incomplete":
      return `Fewer than 90% of planned answers were collected in one period, so no change is shown. Failed collections never count as lost visibility.`;
    case "scope_changed":
      return `No prompt and engine has answers for the same market and brand in both periods. The tracked scope changed, so the periods cannot be compared.`;
    case "no_data":
      return collecting
        ? "Collecting answers. Visibility appears here when the run finishes."
        : `There are no finished runs in the last ${days} days.`;
    default:
      return null;
  }
}

type AiTrendDays = 7 | 28 | 90;

export const aiTrendQueryOptions = (projectId: string, days: AiTrendDays) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "results", "trend", days],
    queryFn: () => getAiVisibilityTrend({ data: { projectId, days } }),
  });

/** The trend panel inside the Prompt tracking card, laid out like rank tracking's overview. */
export function VisibilityTrend({
  projectId,
  collecting,
}: {
  projectId: string;
  collecting: boolean;
}) {
  const [days, setDays] = useState<AiTrendDays>(7);
  const query = useQuery(aiTrendQueryOptions(projectId, days));
  const trend = query.data;
  const message = trend && notice(trend, collecting);
  // Incomplete collection and a changed scope need attention; missing history does not.
  const warning =
    trend?.comparison === "incomplete" || trend?.comparison === "scope_changed";
  return (
    <div className="px-4 pt-2 pb-6">
      <section className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Visibility over time</h2>
          <SegmentedToggle
            showLabels
            items={periods}
            value={String(days)}
            onChange={(next) =>
              setDays(next === "90" ? 90 : next === "28" ? 28 : 7)
            }
          />
        </div>
        {query.isError && (
          <AiQueryError
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
          />
        )}
        {query.isPending && <Skeleton className="h-[220px] w-full" />}
        {trend && (
          <>
            {trend.current.coverage.runs > 0 && (
              <>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {trendSeries.map((series) => (
                      <span
                        key={series.key}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                      >
                        <span
                          className="size-2 rounded-sm"
                          style={{ backgroundColor: series.color }}
                        />
                        {series.label}
                      </span>
                    ))}
                  </div>
                  <VisibilityTrendChart trend={trend} />
                </div>
                <TrendSummary trend={trend} />
              </>
            )}
            {message && (
              <Alert variant={warning ? "warning" : "info"}>
                {warning ? <TriangleAlert /> : <Info />}
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Change({ metric }: { metric: AiTrendMetric }) {
  if (metric.change === null) return null;
  const up = metric.change > 0;
  const down = metric.change < 0;
  return (
    <span
      className={cn(
        "text-sm whitespace-nowrap tabular-nums",
        up && "text-success",
        down && "text-destructive",
        !up && !down && "text-muted-foreground",
      )}
    >
      {up ? "▲ " : down ? "▼ " : ""}
      {Math.abs(metric.change).toFixed(1)}%
    </span>
  );
}

/**
 * Rates under the chart in the shared table, as on the Competitors page: all
 * engines first, then one row per engine.
 */
function TrendSummary({ trend }: { trend: AiTrend }) {
  const rows = [
    {
      key: "all",
      label: <span className="font-medium">All engines</span>,
      mentions: trend.mentions,
      citations: trend.citations,
    },
    ...(trend.engines.length > 1
      ? trend.engines.map((row) => ({
          key: row.engine,
          label: <EngineLabel engine={row.engine} />,
          mentions: row.mentions,
          citations: row.citations,
        }))
      : []),
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Brand mentions</TableHead>
          <TableHead>Owned citations</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.label}</TableCell>
            {[row.mentions, row.citations].map((metric, index) => (
              <TableCell key={index}>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span
                    className={cn(
                      row.key === "all"
                        ? "text-lg font-semibold"
                        : "font-medium",
                    )}
                  >
                    {rate(metric.current)}
                  </span>
                  <Change metric={metric} />
                </span>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
