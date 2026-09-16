import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/client/components/table/TablePagination";
import { BingConnectionCard } from "@/client/features/bing/BingConnectionCard";
import {
  PageTable,
  QueryTable,
  StrikingDistanceTable,
  TabButton,
  TotalsCards,
  tabDimension,
  type Tab,
} from "@/client/features/bing-performance/BingPerformanceParts";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportBingPerformanceTable,
  getBingPerformanceReport,
} from "@/serverFunctions/bingPerformance";
import {
  BING_PERFORMANCE_DEFAULT_PAGE_SIZE,
  BING_PERFORMANCE_PAGE_SIZES,
} from "@/types/schemas/bing-performance";

const PAGE_SIZES = BING_PERFORMANCE_PAGE_SIZES;

export function BingPerformancePage({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("striking");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    BING_PERFORMANCE_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [tab, pageSize]);

  const reportQuery = useQuery({
    queryKey: ["bingPerformance", projectId],
    queryFn: () => getBingPerformanceReport({ data: { projectId } }),
  });
  const report = reportQuery.data;

  const handleExport = async () => {
    if (!report?.connected) return;
    try {
      const dimension = tabDimension(tab);
      const data = await exportBingPerformanceTable({
        data: { projectId, dimension },
      });
      if (data.dimension === "query") {
        downloadCsv(
          `bing-queries-${projectId}.csv`,
          buildCsv(
            [
              "Query",
              "Impressions",
              "Clicks",
              "Avg click position",
              "Avg impression position",
            ],
            data.rows.map((row) => [
              row.query,
              row.impressions,
              row.clicks,
              row.avgClickPosition,
              row.avgImpressionPosition,
            ]),
          ),
        );
      } else {
        downloadCsv(
          `bing-pages-${projectId}.csv`,
          buildCsv(
            ["Page", "Distinct queries"],
            data.rows.map((row) => [row.page, row.queryCount]),
          ),
        );
      }
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Export failed"));
    }
  };

  const isTableTab = tab === "queries" || tab === "pages";
  const queryRows = report?.connected ? report.queries : [];
  const pageRowsAll = report?.connected ? report.pages : [];
  const fullRowCount = tab === "pages" ? pageRowsAll.length : queryRows.length;
  const offset = (page - 1) * pageSize;
  const hasNextPage = offset + pageSize < fullRowCount;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Bing Insights</h1>
            <p className="text-sm text-base-content/70">
              See your site&apos;s clicks, impressions, and query positions from
              Bing Webmaster Tools. Bing reports a fixed window (traffic updates
              daily, query data updates weekly) — there is no date, device, or
              country filter here.
            </p>
          </div>
          {report?.connected ? (
            <Link
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
              className="link link-hover shrink-0 self-start text-sm font-medium text-base-content/60 transition-colors hover:text-base-content sm:mt-1"
            >
              Change property
            </Link>
          ) : null}
        </div>

        {reportQuery.isPending ? (
          <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : reportQuery.isError ? (
          <div className="alert alert-error">
            <span className="text-sm">
              {getStandardErrorMessage(reportQuery.error)}
            </span>
          </div>
        ) : !report?.connected ? (
          <div className="max-w-2xl">
            <BingConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <TotalsCards
              totals={report.totals}
              prevTotals={report.prevTotals}
            />
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
              <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div role="tablist" className="tabs tabs-border w-fit">
                  <TabButton
                    active={tab === "striking"}
                    onClick={() => setTab("striking")}
                    label={`Striking distance (${report.strikingDistance.length})`}
                  />
                  <TabButton
                    active={tab === "queries"}
                    onClick={() => setTab("queries")}
                    label="Queries"
                  />
                  <TabButton
                    active={tab === "pages"}
                    onClick={() => setTab("pages")}
                    label="Pages"
                  />
                </div>
                {isTableTab ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gap-1"
                    onClick={handleExport}
                  >
                    <Download className="size-4" />
                    Download CSV
                  </button>
                ) : null}
              </div>

              {tab === "striking" ? (
                <StrikingDistanceTable rows={report.strikingDistance} />
              ) : (
                <>
                  {tab === "queries" ? (
                    <QueryTable
                      rows={queryRows.slice(offset, offset + pageSize)}
                    />
                  ) : (
                    <PageTable
                      rows={pageRowsAll.slice(offset, offset + pageSize)}
                    />
                  )}
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={PAGE_SIZES}
                    totalCount={fullRowCount}
                    hasNextPage={hasNextPage}
                    isLoading={false}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
