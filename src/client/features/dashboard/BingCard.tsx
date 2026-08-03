import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { last28DayReport } from "@/client/features/bing/bingComparison";
import {
  CardShell,
  EmptyCardBody,
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
  // Same last-28-days framing as the GSC card; deltas vs the prior 28.
  const traffic = last28DayReport(rows);

  return (
    <CardShell
      title="Bing performance"
      stamp={data?.connected ? "Bing Webmaster Tools · last 28 days" : undefined}
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
            value={formatCount(traffic?.current.clicks ?? 0)}
            sub={
              traffic?.previous ? (
                <PercentDelta
                  current={traffic.current.clicks}
                  previous={traffic.previous.clicks}
                />
              ) : undefined
            }
          />
          <Stat
            label="Impressions"
            value={formatCount(traffic?.current.impressions ?? 0)}
            sub={
              traffic?.previous ? (
                <PercentDelta
                  current={traffic.current.impressions}
                  previous={traffic.previous.impressions}
                />
              ) : undefined
            }
          />
          <Stat label="CTR" value={formatCtr(traffic?.current.ctr ?? 0)} />
        </div>
      ) : null}
    </CardShell>
  );
}
