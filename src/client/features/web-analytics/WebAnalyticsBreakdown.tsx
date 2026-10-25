import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { EmptyState } from "@/client/components/EmptyState";
import { QueryState } from "@/client/components/QueryState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { getWebAnalyticsBreakdown } from "@/serverFunctions/webAnalytics";
import type {
  WebAnalyticsDimension,
  WebAnalyticsPeriod,
} from "@/types/schemas/web-analytics";

export function WebAnalyticsBreakdown({
  projectId,
  period,
  dimension,
  title,
  valueLabel,
}: {
  projectId: string;
  period: WebAnalyticsPeriod;
  dimension: WebAnalyticsDimension;
  title: string;
  valueLabel: string;
}) {
  const rowsQuery = useQuery({
    queryKey: ["webAnalyticsBreakdown", projectId, period, dimension],
    queryFn: () =>
      getWebAnalyticsBreakdown({ data: { projectId, period, dimension } }),
  });

  return (
    <CardShell title={title}>
      <QueryState
        query={rowsQuery}
        errorFallback="Could not load this breakdown."
        loading={<div className="h-40" />}
      >
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No data yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{title}</TableHead>
                  <TableHead className="text-right">Visitors</TableHead>
                  <TableHead className="text-right">{valueLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label ?? "(none)"}>
                    <TableCell className="max-w-64 truncate">
                      {row.label ?? "(none)"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.visitors)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.pageviews)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        }
      </QueryState>
    </CardShell>
  );
}
