import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import {
  DimensionTable,
  exportCurrentTab,
  StrikingDistanceTable,
  TabButton,
  TotalsCards,
  type Tab,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";

type DateRange = "last_7_days" | "last_28_days" | "last_3_months";
type Device = "DESKTOP" | "MOBILE" | "TABLET";

const RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_28_days", label: "Last 28 days" },
  { value: "last_3_months", label: "Last 3 months" },
];

const DEVICE_OPTIONS: Array<{ value: Device; label: string }> = [
  { value: "DESKTOP", label: "Desktop" },
  { value: "MOBILE", label: "Mobile" },
  { value: "TABLET", label: "Tablet" },
];

// Sentinel for "no filter" in the selects; never sent to the server.
const ALL = "ALL";

function isDateRange(value: string): value is DateRange {
  return RANGE_OPTIONS.some((option) => option.value === value);
}

function isDevice(value: string): value is Device {
  return DEVICE_OPTIONS.some((option) => option.value === value);
}

export function SearchPerformancePage({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<DateRange>("last_28_days");
  const [device, setDevice] = useState<Device | typeof ALL>(ALL);
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
  });

  const report = reportQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Search Performance</h1>
          <p className="text-sm text-base-content/60">
            Your site&apos;s real Google Search data, free from Search Console.
          </p>
        </div>
        {report?.connected ? (
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => exportCurrentTab(report, tab)}
            >
              <Download className="size-4" /> Export CSV
            </button>
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
  );
}
