import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { splitDailySeries } from "@/client/features/bing/bingComparison";
import {
  CardShell,
  EmptyCardBody,
  formatDay,
  moreDetailsClass,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import {
  formatCount,
  formatCtr,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getBingPerformance } from "@/serverFunctions/bing";

export function BingCard({ projectId }: { projectId: string }) {
  // Same key as the Bing performance page — identical call, shared cache.
  const performanceQuery = useQuery({
    queryKey: ["bingPerformance", projectId],
    queryFn: () => getBingPerformance({ data: { projectId } }),
  });
  const data = performanceQuery.data;

  if (data && !data.connected) {
    return (
      <CardShell title="Bing performance">
        <EmptyCardBody
          message="See your clicks and impressions from Bing Webmaster Tools."
          cta={
            <Link
              to="/p/$projectId/bing"
              params={{ projectId }}
              className="btn btn-primary btn-sm"
            >
              Connect Bing
            </Link>
          }
        />
      </CardShell>
    );
  }

  const rows = data?.connected ? (data.rows ?? []) : [];
  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
    }),
    { clicks: 0, impressions: 0 },
  );
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const comparison = splitDailySeries(rows);
  // Bing decides the reporting window (no date-range parameter), so stamp
  // the dates it actually sent rather than a fixed "last N days".
  const dated = rows
    .flatMap((row) => (row.date === null ? [] : [row.date]))
    .toSorted();
  const stamp =
    dated.length > 0
      ? `Bing Webmaster Tools · ${formatDay(dated[0])} – ${formatDay(dated[dated.length - 1])}`
      : "Bing Webmaster Tools";

  return (
    <CardShell
      title="Bing performance"
      stamp={data?.connected ? stamp : undefined}
      action={
        <Link
          to="/p/$projectId/bing"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
        </Link>
      }
    >
      {performanceQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : performanceQuery.isError ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Bing Webmaster Tools data. Try again shortly.
        </p>
      ) : data?.connected ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Clicks"
            value={formatCount(totals.clicks)}
            sub={
              comparison ? (
                <PercentDelta
                  current={comparison.current.clicks}
                  previous={comparison.previous.clicks}
                />
              ) : undefined
            }
          />
          <Stat
            label="Impressions"
            value={formatCount(totals.impressions)}
            sub={
              comparison ? (
                <PercentDelta
                  current={comparison.current.impressions}
                  previous={comparison.previous.impressions}
                />
              ) : undefined
            }
          />
          <Stat label="CTR" value={formatCtr(ctr)} />
        </div>
      ) : null}
    </CardShell>
  );
}
