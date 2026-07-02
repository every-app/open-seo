import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Download, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import {
  DimensionTable,
  exportDimensionRows,
  exportStriking,
  StrikingDistanceTable,
  TabButton,
  TotalsCards,
  type ExportTarget,
  type Tab,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import {
  GSC_DEVICES,
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  SEARCH_PERFORMANCE_PAGE_SIZES,
  SEARCH_PERFORMANCE_RANGES,
  type SearchPerformanceDateRange,
  type SearchPerformanceDevice,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";

const RANGE_LABELS: Record<SearchPerformanceDateRange, string> = {
  last_7_days: "Last 7 days",
  last_28_days: "Last 28 days",
  last_3_months: "Last 3 months",
};
const RANGE_OPTIONS = SEARCH_PERFORMANCE_RANGES.map((value) => ({
  value,
  label: RANGE_LABELS[value],
}));

const DEVICE_LABELS: Record<SearchPerformanceDevice, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
};
const DEVICE_OPTIONS = GSC_DEVICES.map((value) => ({
  value,
  label: DEVICE_LABELS[value],
}));

// Sentinel for "no filter" in the selects; never sent to the server.
const ALL = "ALL";

function isDateRange(value: string): value is SearchPerformanceDateRange {
  return SEARCH_PERFORMANCE_RANGES.some((option) => option === value);
}

function isDevice(value: string): value is SearchPerformanceDevice {
  return GSC_DEVICES.some((option) => option === value);
}

function tabDimension(tab: Tab): SearchPerformanceTableDimension {
  return tab === "pages" ? "page" : "query";
}

type FilterInput = {
  dateRange: SearchPerformanceDateRange;
  device?: SearchPerformanceDevice;
  country?: string;
};

// The server filter payload: drop device/country when set to the "ALL" sentinel.
function buildFilterInput(
  range: SearchPerformanceDateRange,
  device: SearchPerformanceDevice | typeof ALL,
  country: string,
): FilterInput {
  return {
    dateRange: range,
    ...(device === ALL ? {} : { device }),
    ...(country === ALL ? {} : { country }),
  };
}

// Single source for the paginated table query, shared by the live query and the
// warm-on-connect prefetch so their key + fn can never drift apart.
function tableQueryOptions(
  projectId: string,
  dimension: SearchPerformanceTableDimension,
  page: number,
  pageSize: number,
  filterInput: FilterInput,
) {
  return queryOptions({
    queryKey: [
      "searchPerformanceTable",
      projectId,
      dimension,
      page,
      pageSize,
      filterInput,
    ],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension, page, pageSize, ...filterInput },
      }),
  });
}

export function SearchPerformancePage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [range, setRange] =
    useState<SearchPerformanceDateRange>("last_28_days");
  const [device, setDevice] = useState<SearchPerformanceDevice | typeof ALL>(
    ALL,
  );
  const [country, setCountry] = useState<string>(ALL);
  const [tab, setTab] = useState<Tab>("striking");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  );

  // Any change to the query set (tab, filters, page size) restarts at page 1.
  useEffect(() => {
    setPage(1);
  }, [tab, range, device, country, pageSize]);

  const filterInput = buildFilterInput(range, device, country);

  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, range, device, country],
    queryFn: () =>
      getSearchPerformanceReport({ data: { projectId, ...filterInput } }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;

  const isTableTab = tab === "queries" || tab === "pages";
  const dimension = tabDimension(tab);
  const tableQuery = useQuery({
    ...tableQueryOptions(projectId, dimension, page, pageSize, filterInput),
    enabled: report?.connected === true && isTableTab,
    placeholderData: keepPreviousData,
  });
  const tableData = tableQuery.data;
  const tableRows = tableData?.connected ? tableData.rows : [];
  const hasNextPage = tableData?.connected ? tableData.hasNextPage : false;

  // Warm the Queries tab (first page) as soon as the report connects so the tab
  // opens instantly instead of showing a spinner. Free first-party GSC data.
  useEffect(() => {
    if (report?.connected !== true) return;
    void queryClient.prefetchQuery(
      tableQueryOptions(
        projectId,
        "query",
        1,
        SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
        buildFilterInput(range, device, country),
      ),
    );
  }, [report?.connected, projectId, range, device, country, queryClient]);

  const handleExport = async (target: ExportTarget) => {
    if (!report?.connected) return;
    try {
      if (tab === "striking") {
        exportStriking(report, target);
        return;
      }
      const data = await exportSearchPerformanceTable({
        data: { projectId, dimension, ...filterInput },
      });
      exportDimensionRows(dimension, data.rows, report.range, target);
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Export failed"));
    }
  };

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Search Performance</h1>
          <p className="text-sm text-base-content/70">
            See your site&apos;s clicks, impressions, CTR, and position from
            Google Search Console.
          </p>
        </div>

        {reportQuery.isPending ? (
          <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
            <Loader2 className="size-4 animate-spin" /> Loading Search Console
            data…
          </div>
        ) : reportQuery.isError ? (
          <div className="alert alert-error">
            <span className="text-sm">
              {getStandardErrorMessage(reportQuery.error)}
            </span>
          </div>
        ) : !report?.connected ? (
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-base-content/70">
              Find your striking-distance keywords — queries ranking just off
              the top of page one, where a small improvement can win the most
              new clicks. Connect Search Console to see them.
            </p>
            <SearchConsoleConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <TotalsCards report={report} />
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
              <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div role="tablist" className="tabs tabs-box w-fit">
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
                <div className="flex flex-wrap items-center gap-2">
                  {reportQuery.isFetching && !reportQuery.isPending ? (
                    <Loader2 className="size-4 animate-spin text-base-content/40" />
                  ) : null}
                  <select
                    className="select select-bordered select-sm w-36"
                    value={device}
                    onChange={(event) => {
                      setDevice(
                        isDevice(event.target.value) ? event.target.value : ALL,
                      );
                    }}
                    aria-label="Device filter"
                  >
                    <option value={ALL}>All devices</option>
                    {DEVICE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select select-bordered select-sm w-36"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    aria-label="Country filter"
                  >
                    <option value={ALL}>All countries</option>
                    {report.countries.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.key.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select select-bordered select-sm w-36"
                    value={range}
                    onChange={(event) => {
                      if (isDateRange(event.target.value)) {
                        setRange(event.target.value);
                      }
                    }}
                    aria-label="Date range"
                  >
                    {RANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <TableExportMenu
                    buttonClassName="btn btn-ghost btn-sm gap-1"
                    actions={[
                      {
                        label: "Export to Sheets",
                        icon: <Sheet className="size-4" />,
                        onClick: () => void handleExport("sheets"),
                      },
                      {
                        label: "Download CSV",
                        icon: <Download className="size-4" />,
                        onClick: () => void handleExport("csv"),
                      },
                    ]}
                  />
                </div>
              </div>

              {tab === "striking" ? (
                <StrikingDistanceTable
                  projectId={projectId}
                  rows={report.strikingDistance}
                />
              ) : tableQuery.isPending ? (
                <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : tableQuery.isError ? (
                <div className="p-4">
                  <div className="alert alert-error">
                    <span className="text-sm">
                      {getStandardErrorMessage(tableQuery.error)}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4">
                    <DimensionTable
                      rows={tableRows}
                      keyLabel={tab === "queries" ? "Query" : "Page"}
                    />
                  </div>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
                    totalCount={null}
                    hasNextPage={hasNextPage}
                    isLoading={tableQuery.isFetching}
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
