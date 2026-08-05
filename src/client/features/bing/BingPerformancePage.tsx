import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BingAiCitationsPanel } from "@/client/features/bing/BingAiCitationsPanel";
import { BingConnectionCard } from "@/client/features/bing/BingConnectionCard";
import { BingCrawlPanel } from "@/client/features/bing/BingCrawlPanel";
import {
  BingDimensionTable,
  BingPageQueriesPanel,
  BingStrikingTable,
  type BingQueryReport,
} from "@/client/features/bing/BingTables";
import {
  last28DayReport,
  percentDelta,
  type Delta,
} from "@/client/features/bing/bingComparison";
import { formatBingDay } from "@/client/features/bing/formatBingDay";
import {
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { TabButton } from "@/client/features/search-performance/SearchPerformanceParts";
import { getBingPerformance, getBingQueryReport } from "@/serverFunctions/bing";

type BingRow = {
  date: string | null;
  clicks: number;
  impressions: number;
};

type Tab = "striking" | "queries" | "pages" | "daily" | "crawl" | "ai";

/**
 * Bing performance. Deliberately NOT a source toggle on the Search Console
 * report: Bing's endpoints accept no date range, no device or country filter,
 * and no paging, so sharing that page's chrome would advertise controls Bing
 * cannot honour. Query/page rows are additionally SAMPLED (~16 dates over ~5
 * months), so they are aggregated over the whole window. See specs/0009.
 */
export function BingPerformancePage({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("striking");
  // Pages-tab drill-down: which page's queries are open, if any.
  const [drillDownPage, setDrillDownPage] = useState<string | null>(null);
  const switchTab = (next: Tab) => {
    setDrillDownPage(null);
    setTab(next);
  };
  const performanceQuery = useQuery({
    queryKey: ["bingPerformance", projectId],
    queryFn: () => getBingPerformance({ data: { projectId } }),
  });
  const reportQuery = useQuery({
    queryKey: ["bingQueryReport", projectId],
    queryFn: () => getBingQueryReport({ data: { projectId } }),
  });

  const data = performanceQuery.data;
  const rows: BingRow[] = data?.connected ? (data.rows ?? []) : [];
  const report: BingQueryReport | null = reportQuery.data?.connected
    ? reportQuery.data
    : null;
  // Tiles mirror the Search Console report's framing: latest 28 reported
  // days, delta vs the prior 28. The daily tab still shows Bing's full window.
  const traffic = last28DayReport(rows);
  const deltaTitle = traffic?.previous
    ? `${traffic.current.startDate} to ${traffic.current.endDate} vs ${traffic.previous.startDate} to ${traffic.previous.endDate}`
    : undefined;
  const avgPosition = weightedAveragePosition(report);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bing Performance</h1>
        <p className="text-sm text-base-content/70">
          Clicks, impressions, queries and pages from Bing Webmaster Tools.
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
            <span>Last 28 days vs prior 28</span>
            {data.connectedBy ? (
              <span>Connected by {data.connectedBy}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Clicks"
              value={(traffic?.current.clicks ?? 0).toLocaleString()}
              delta={
                traffic?.previous
                  ? percentDelta(
                      traffic.current.clicks,
                      traffic.previous.clicks,
                    )
                  : null
              }
              deltaTitle={deltaTitle}
            />
            <StatTile
              label="Impressions"
              value={(traffic?.current.impressions ?? 0).toLocaleString()}
              delta={
                traffic?.previous
                  ? percentDelta(
                      traffic.current.impressions,
                      traffic.previous.impressions,
                    )
                  : null
              }
              deltaTitle={deltaTitle}
            />
            <StatTile
              label="CTR"
              value={formatCtr(traffic?.current.ctr ?? 0)}
              delta={
                traffic?.previous
                  ? percentDelta(traffic.current.ctr, traffic.previous.ctr)
                  : null
              }
              deltaTitle={deltaTitle}
            />
            <StatTile
              label="Avg position"
              value={avgPosition === null ? "–" : formatPosition(avgPosition)}
              delta={null}
              deltaTitle="From Bing's sampled query data — no comparison available"
            />
          </div>

          <div>
            <div role="tablist" className="tabs tabs-border">
              <TabButton
                active={tab === "striking"}
                onClick={() => switchTab("striking")}
                label="Striking distance"
              />
              <TabButton
                active={tab === "queries"}
                onClick={() => switchTab("queries")}
                label="Queries"
              />
              <TabButton
                active={tab === "pages"}
                onClick={() => switchTab("pages")}
                label="Pages"
              />
              <TabButton
                active={tab === "daily"}
                onClick={() => switchTab("daily")}
                label="Daily"
              />
              <TabButton
                active={tab === "crawl"}
                onClick={() => switchTab("crawl")}
                label="Crawl"
              />
              <TabButton
                active={tab === "ai"}
                onClick={() => switchTab("ai")}
                label="AI performance"
              />
            </div>

            <div className="mt-4 rounded-xl border border-base-300 bg-base-100 shadow-sm">
              {tab === "ai" ? (
                <BingAiCitationsPanel projectId={projectId} />
              ) : tab === "crawl" ? (
                <BingCrawlPanel projectId={projectId} />
              ) : tab === "daily" ? (
                rows.length === 0 ? (
                  <EmptyState />
                ) : (
                  <PerformanceTable rows={rows} />
                )
              ) : reportQuery.isLoading ? (
                <div className="p-6">
                  <LoadingState label="Loading Bing queries…" />
                </div>
              ) : reportQuery.isError ? (
                <div className="p-6">
                  <ErrorState onRetry={() => void reportQuery.refetch()} />
                </div>
              ) : !report ? (
                <EmptyState />
              ) : tab === "striking" ? (
                <BingStrikingTable
                  projectId={projectId}
                  rows={report.striking}
                />
              ) : tab === "queries" ? (
                <BingDimensionTable rows={report.queries} keyLabel="Query" />
              ) : drillDownPage ? (
                <BingPageQueriesPanel
                  projectId={projectId}
                  pageUrl={drillDownPage}
                  onBack={() => setDrillDownPage(null)}
                />
              ) : (
                <BingDimensionTable
                  rows={report.pages}
                  keyLabel="Page"
                  onDrillDown={setDrillDownPage}
                />
              )}
            </div>

            {tab !== "daily" && tab !== "crawl" && tab !== "ai" ? (
              <p className="mt-2 text-xs text-base-content/50">
                Aggregated from Bing's sampled data (~5 months). Bing provides
                no date range.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Impression-weighted average position across the aggregated query rows —
 *  the sampled data supports one whole-window number, not a trend. */
function weightedAveragePosition(
  report: BingQueryReport | null,
): number | null {
  if (!report) return null;
  let weight = 0;
  let weighted = 0;
  for (const row of report.queries) {
    if (row.position !== null && row.impressions > 0) {
      weight += row.impressions;
      weighted += row.position * row.impressions;
    }
  }
  return weight > 0 ? weighted / weight : null;
}

function StatTile({
  label,
  value,
  delta,
  deltaTitle,
}: {
  label: string;
  value: string;
  delta: Delta;
  deltaTitle?: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta ? (
          <span
            className={`text-xs ${delta.improved ? "text-success" : "text-error"}`}
            title={deltaTitle}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PerformanceTable({ rows }: { rows: BingRow[] }) {
  return (
    <div className="overflow-x-auto">
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

function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      {label ?? "Loading Bing performance…"}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-base-content/60">
        Bing hasn't reported any data for this site yet.
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
