import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Sheet } from "lucide-react";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import {
  DimensionTable,
  exportCurrentTab,
  exportCurrentTabToSheets,
  StrikingDistanceTable,
  TabButton,
  TotalsCards,
  type Tab,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  GSC_DEVICES,
  SEARCH_PERFORMANCE_RANGES,
  type SearchPerformanceDateRange,
  type SearchPerformanceDevice,
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

export function SearchPerformancePage({ projectId }: { projectId: string }) {
  const [range, setRange] =
    useState<SearchPerformanceDateRange>("last_28_days");
  const [device, setDevice] = useState<SearchPerformanceDevice | typeof ALL>(
    ALL,
  );
  const [country, setCountry] = useState<string>(ALL);
  const [tab, setTab] = useState<Tab>("striking");

  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, range, device, country],
    queryFn: () =>
      getSearchPerformanceReport({
        data: {
          projectId,
          dateRange: range,
          ...(device === ALL ? {} : { device }),
          ...(country === ALL ? {} : { country }),
        },
      }),
    placeholderData: keepPreviousData,
  });

  const report = reportQuery.data;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Search Performance</h1>
            <p className="text-sm text-base-content/70">
              See your site&apos;s clicks, impressions, CTR, and position from
              Google Search Console.
            </p>
          </div>
          {report?.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              {reportQuery.isFetching && !reportQuery.isPending ? (
                <Loader2 className="size-4 animate-spin text-base-content/40" />
              ) : null}
              <select
                className="select select-bordered select-sm"
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
                className="select select-bordered select-sm"
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
                className="select select-bordered select-sm"
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
            </div>
          ) : null}
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
          <div className="max-w-2xl">
            <SearchConsoleConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <TotalsCards report={report} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" className="tabs tabs-border">
                <TabButton
                  active={tab === "striking"}
                  onClick={() => setTab("striking")}
                  label={`Striking distance (${report.strikingDistance.length})`}
                />
                <TabButton
                  active={tab === "queries"}
                  onClick={() => setTab("queries")}
                  label={`Queries (${report.queries.length})`}
                />
                <TabButton
                  active={tab === "pages"}
                  onClick={() => setTab("pages")}
                  label={`Pages (${report.pages.length})`}
                />
              </div>
              <TableExportMenu
                buttonClassName="btn btn-ghost btn-sm gap-1"
                actions={[
                  {
                    label: "Export to Sheets",
                    icon: <Sheet className="size-4" />,
                    onClick: () => exportCurrentTabToSheets(report, tab),
                  },
                  {
                    label: "Download CSV",
                    icon: <Download className="size-4" />,
                    onClick: () => exportCurrentTab(report, tab),
                  },
                ]}
              />
            </div>
            {tab === "striking" ? (
              <StrikingDistanceTable
                projectId={projectId}
                rows={report.strikingDistance}
              />
            ) : (
              <DimensionTable
                rows={tab === "queries" ? report.queries : report.pages}
                keyLabel={tab === "queries" ? "Query" : "Page"}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
