import { useQuery } from "@tanstack/react-query";
import { BingConnectionCard } from "@/client/features/bing/BingConnectionCard";
import { formatBingDay } from "@/client/features/bing/formatBingDay";
import { getBingPerformance } from "@/serverFunctions/bing";

type BingRow = {
  date: string | null;
  clicks: number;
  impressions: number;
};

/**
 * Bing performance. Deliberately NOT a source toggle on the Search Console
 * report: Bing's GetRankAndTrafficStats accepts no date range, no device or
 * country filter, and no paging, so sharing that page's chrome would advertise
 * controls Bing cannot honour. See specs/0009.
 */
export function BingPerformancePage({ projectId }: { projectId: string }) {
  const performanceQuery = useQuery({
    queryKey: ["bingPerformance", projectId],
    queryFn: () => getBingPerformance({ data: { projectId } }),
  });

  const data = performanceQuery.data;
  const rows: BingRow[] = data?.connected ? (data.rows ?? []) : [];
  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
    }),
    { clicks: 0, impressions: 0 },
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Bing performance</h1>
        <p className="mt-1 text-sm text-base-content/60">
          Daily clicks and impressions from Bing Webmaster Tools.
        </p>
      </div>

      {performanceQuery.isLoading ? (
        <LoadingState />
      ) : performanceQuery.isError ? (
        <ErrorState onRetry={() => void performanceQuery.refetch()} />
      ) : !data?.connected ? (
        <div className="max-w-2xl">
          <BingConnectionCard projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-base-content/60">
            <span className="font-mono">{data.siteUrl}</span>
            {data.connectedBy ? (
              <span>Connected by {data.connectedBy}</span>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
            <StatTile label="Clicks" value={totals.clicks} />
            <StatTile label="Impressions" value={totals.impressions} />
          </div>

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <PerformanceTable rows={rows} />
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function PerformanceTable({ rows }: { rows: BingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th className="text-right">Clicks</th>
            <th className="text-right">Impressions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.date ?? `row-${index}`}>
              <td className="whitespace-nowrap">{formatBingDay(row.date)}</td>
              <td className="text-right tabular-nums">
                {row.clicks.toLocaleString()}
              </td>
              <td className="text-right tabular-nums">
                {row.impressions.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      Loading Bing performance…
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-base-300 p-8 text-center">
      <p className="text-sm text-base-content/60">
        Bing hasn't reported any traffic for this site yet.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-error">Couldn't load Bing performance.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
