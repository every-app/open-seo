import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MousePointerClick } from "lucide-react";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  ClarityBreakdowns,
  ClarityFriction,
  ClarityPagesTable,
  ClaritySummary,
} from "@/client/features/clarity/ClarityInsightsParts";
import { MicrosoftClarityConnectionCard } from "@/client/features/clarity/MicrosoftClarityConnectionCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  CLARITY_INSIGHTS_PAGE_SIZES,
  getClarityInsights,
} from "@/serverFunctions/clarity";

type ReportDays = 1 | 2 | 3;

const PERIODS: Array<{ value: ReportDays; label: string }> = [
  { value: 1, label: "Last 24 hours" },
  { value: 2, label: "Last 48 hours" },
  { value: 3, label: "Last 72 hours" },
];

function loadingState() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading Clarity insights"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl border border-base-300 bg-base-200/50"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-base-300 bg-base-200/50" />
    </div>
  );
}

export function ClarityInsightsPage({ projectId }: { projectId: string }) {
  const [numOfDays, setNumOfDays] = useState<ReportDays>(3);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    CLARITY_INSIGHTS_PAGE_SIZES[0],
  );

  useEffect(() => setPage(1), [numOfDays, pageSize]);

  const reportQuery = useQuery({
    queryKey: ["clarityInsights", projectId, numOfDays, page, pageSize],
    queryFn: () =>
      getClarityInsights({
        data: { projectId, numOfDays, page, pageSize: validPageSize(pageSize) },
      }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MousePointerClick className="size-5 text-[#1673ff]" />
              <h1 className="text-2xl font-semibold">Clarity Insights</h1>
            </div>
            <p className="mt-1 text-sm text-base-content/70">
              Recent engagement, scrolling, and interaction friction from
              Microsoft Clarity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {report?.connected ? (
              <select
                className="select select-bordered select-sm w-40"
                value={numOfDays}
                aria-label="Clarity reporting period"
                onChange={(event) =>
                  setNumOfDays(reportDays(event.target.value))
                }
              >
                {PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            ) : null}
            <Link
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
              hash="microsoft-clarity"
              className="link link-hover text-sm font-medium text-base-content/60"
            >
              Integration settings
            </Link>
          </div>
        </div>

        {reportQuery.isPending ? (
          loadingState()
        ) : reportQuery.isError ? (
          <div className="alert alert-error">
            <AlertTriangle className="size-5" />
            <span className="text-sm">
              {getStandardErrorMessage(reportQuery.error)}
            </span>
          </div>
        ) : !report?.connected ? (
          <div className="max-w-2xl">
            <MicrosoftClarityConnectionCard projectId={projectId} />
          </div>
        ) : (
          <div
            className="space-y-6"
            aria-busy={reportQuery.isFetching}
            data-ph-mask
          >
            <ReportNotices report={report} fetching={reportQuery.isFetching} />
            <ClaritySummary data={report} />
            <ClarityFriction data={report} />
            <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
              <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold">Pages</h2>
                  <p className="text-sm text-base-content/60">
                    URL-level behavior. Query strings and fragments are removed.
                  </p>
                </div>
                {reportQuery.isFetching ? (
                  <Loader2 className="size-4 animate-spin text-base-content/40" />
                ) : null}
              </div>
              <ClarityPagesTable rows={report.pageInsights.rows} />
              <TablePagination
                page={page}
                pageSize={pageSize}
                pageSizes={CLARITY_INSIGHTS_PAGE_SIZES}
                totalCount={report.pageInsights.totalCount}
                hasNextPage={report.pageInsights.hasNextPage}
                isLoading={reportQuery.isFetching}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </section>
            <ClarityBreakdowns data={report} />
          </div>
        )}
      </div>
    </div>
  );
}

function validPageSize(value: number): 10 | 25 | 50 {
  return value === 25 || value === 50 ? value : 10;
}

function reportDays(value: string): ReportDays {
  if (value === "1") return 1;
  if (value === "2") return 2;
  return 3;
}

function ReportNotices({
  report,
  fetching,
}: {
  report: Extract<
    Awaited<ReturnType<typeof getClarityInsights>>,
    { connected: true }
  >;
  fetching: boolean;
}) {
  const stale = report.cache.overview.stale || report.cache.urls.stale;
  const limited = report.warnings.includes("provider_row_limit_reached");
  const fetchedAt =
    report.cache.overview.fetchedAt < report.cache.urls.fetchedAt
      ? report.cache.overview.fetchedAt
      : report.cache.urls.fetchedAt;
  return (
    <div className="space-y-2">
      {stale ? (
        <div className="alert alert-warning text-sm">
          Clarity was temporarily unavailable, so this view uses an older cached
          report.
        </div>
      ) : null}
      {limited ? (
        <div className="alert alert-info text-sm">
          Clarity reached its 1,000-row provider limit for at least one metric;
          this view may be partial.
        </div>
      ) : null}
      <p className="flex items-center gap-2 text-xs text-base-content/45">
        {fetching ? <Loader2 className="size-3 animate-spin" /> : null}
        UTC data · oldest report fetched {new Date(fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
