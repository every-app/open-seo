import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CardShell } from "@/client/components/CardShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { BingConnectionCard } from "@/client/features/integrations/BingConnectionCard";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import { getBingSummary } from "@/serverFunctions/bing";
import {
  MetricsTableSkeleton,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";

export function BingCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const summaryQuery = useQuery({
    queryKey: ["dashboardBingSummary", projectId],
    queryFn: () => getBingSummary({ data: { projectId } }),
    enabled: connected,
  });
  const summaryData = summaryQuery.data;

  // Not connected (or a rejected key discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (summaryData && !summaryData.connected)) {
    return (
      <div id="connect-bing">
        <BingConnectionCard projectId={projectId} />
      </div>
    );
  }

  const total = summaryData?.connected ? summaryData.summary : null;
  const days =
    summaryData?.connected && summaryData.coverage.days > 0
      ? summaryData.coverage.days
      : null;

  return (
    <CardShell
      title="Bing Webmaster Tools Performance"
      icon={<BingWebmasterLogo className="size-5" />}
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          search={{ source: "bing" }}
          className={moreDetailsClass}
        >
          View Bing insights →
        </Link>
      }
    >
      <p className="mb-4 text-sm font-medium text-muted-foreground">
        Bing Webmaster Tools
        {days === null ? "" : ` · Last ${days} days`}
      </p>
      {summaryQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Bing data. Try again shortly.
        </p>
      ) : !summaryData ? (
        <MetricsTableSkeleton />
      ) : !total ? (
        <p className="text-sm text-muted-foreground">
          No Bing data yet — it can take a few days to appear after a property
          is verified.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { label: "Clicks", value: formatCount(total.clicks) },
              {
                label: "Impressions",
                value: formatCount(total.impressions),
              },
              { label: "Click-through rate", value: formatCtr(total.ctr) },
              {
                label: "Average position",
                value:
                  total.position === undefined
                    ? "—"
                    : formatPosition(total.position),
              },
            ].map((metric) => (
              <TableRow key={metric.label}>
                <TableCell>{metric.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {metric.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardShell>
  );
}
