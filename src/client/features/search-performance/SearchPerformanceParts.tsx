import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AppDataTable,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import {
  TableBulkActionBar,
  TableBulkActionButton,
} from "@/client/components/table/TableBulkActionBar";
import {
  buildDimensionColumns,
  buildStrikingColumns,
  formatCount,
  formatCtr,
  formatPosition,
  type Report,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { saveKeywords } from "@/serverFunctions/keywords";

export type Tab = "striking" | "queries" | "pages";

function buildTabTable(
  report: Report,
  tab: Tab,
): { filename: string; headers: string[]; rows: CsvValue[][] } {
  const stamp = `${report.range.startDate}-to-${report.range.endDate}`;
  if (tab === "striking") {
    return {
      filename: `search-performance-striking-distance-${stamp}.csv`,
      headers: ["Query", "Page", "Impressions", "Clicks", "Position"],
      rows: report.strikingDistance.map((row) => [
        row.query,
        row.page,
        row.impressions,
        row.clicks,
        row.position,
      ]),
    };
  }
  const source = tab === "queries" ? report.queries : report.pages;
  return {
    filename: `search-performance-${tab}-${stamp}.csv`,
    headers: [
      tab === "queries" ? "Query" : "Page",
      "Clicks",
      "Impressions",
      "CTR",
      "Position",
    ],
    rows: source.map((row) => [
      row.key,
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ]),
  };
}

export function exportCurrentTab(report: Report, tab: Tab): void {
  const { filename, headers, rows } = buildTabTable(report, tab);
  downloadCsv(filename, buildCsv(headers, rows));
  captureClientEvent("data:export", {
    source_feature: "search_performance",
    result_count: rows.length,
  });
}

export function exportCurrentTabToSheets(report: Report, tab: Tab): void {
  const { headers, rows } = buildTabTable(report, tab);
  void exportTableToSheets({ headers, rows, feature: "search_performance" });
}

export function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab ${active ? "tab-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type Delta = { text: string; improved: boolean } | null;

function percentDelta(current: number, previous: number): Delta {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  const pct = (change * 100).toFixed(1);
  return { text: `${change >= 0 ? "+" : ""}${pct}%`, improved: change >= 0 };
}

/** Position falls as rankings improve, so the delta is inverted. */
function positionDelta(current: number, previous: number): Delta {
  if (previous <= 0 || current <= 0) return null;
  const change = previous - current;
  return {
    text: `${change >= 0 ? "+" : ""}${change.toFixed(1)}`,
    improved: change >= 0,
  };
}

export function TotalsCards({ report }: { report: Report }) {
  const { totals, prevTotals, range } = report;
  const deltaTitle = `vs ${range.prevStartDate} to ${range.prevEndDate}`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TotalCard
        label="Clicks"
        value={formatCount(totals.clicks)}
        delta={percentDelta(totals.clicks, prevTotals.clicks)}
        deltaTitle={deltaTitle}
      />
      <TotalCard
        label="Impressions"
        value={formatCount(totals.impressions)}
        delta={percentDelta(totals.impressions, prevTotals.impressions)}
        deltaTitle={deltaTitle}
      />
      <TotalCard
        label="CTR"
        value={formatCtr(totals.ctr)}
        delta={percentDelta(totals.ctr, prevTotals.ctr)}
        deltaTitle={deltaTitle}
      />
      <TotalCard
        label="Avg position"
        value={formatPosition(totals.position)}
        delta={positionDelta(totals.position, prevTotals.position)}
        deltaTitle={deltaTitle}
      />
    </div>
  );
}

function TotalCard({
  label,
  value,
  delta,
  deltaTitle,
}: {
  label: string;
  value: string;
  delta: Delta;
  deltaTitle: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="text-xs uppercase tracking-wide text-base-content/60">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{value}</span>
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

export function DimensionTable({
  rows,
  keyLabel,
}: {
  rows: Report["queries"];
  keyLabel: string;
}) {
  const columns = useMemo(() => buildDimensionColumns(keyLabel), [keyLabel]);
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    initialState: { sorting: [{ id: "clicks", desc: true }] },
  });
  return (
    <AppDataTable
      table={table}
      className="table table-zebra table-sm"
      wrapperClassName="overflow-x-auto rounded-lg border border-base-300"
      empty={
        <p className="p-6 text-sm text-base-content/60">
          No data for this period yet. Search Console data trails by a few days.
        </p>
      }
    />
  );
}

export function StrikingDistanceTable({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Report["strikingDistance"];
}) {
  const queryClient = useQueryClient();
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo(() => buildStrikingColumns(anchorRef), [anchorRef]);
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => `${row.query}::${row.page}`,
    initialState: { sorting: [{ id: "impressions", desc: true }] },
  });

  // Rows are query x page; saving dedupes to the query strings.
  const selectedQueries = Array.from(
    new Set(table.getSelectedRowModel().rows.map((row) => row.original.query)),
  );

  const save = useMutation({
    mutationFn: (keywords: string[]) =>
      saveKeywords({ data: { projectId, keywords } }),
    onSuccess: (_result, keywords) => {
      captureClientEvent("keyword:save", {
        source_feature: "search_performance",
        keyword_count: keywords.length,
      });
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success(
        `Saved ${keywords.length} ${keywords.length === 1 ? "keyword" : "keywords"}`,
      );
      setRowSelection({});
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Could not save keywords"));
    },
  });

  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-base-content/60">
        No striking-distance queries in this period. These are queries ranking
        at positions 5 to 20, where an improvement is most likely to move
        traffic.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-base-content/60">
          Queries ranking at positions 5 to 20, sorted by impressions. Improve
          the listed page to move them into the top results.
        </p>
        <Link
          to="/p/$projectId/saved"
          params={{ projectId }}
          className="btn btn-ghost btn-sm"
        >
          View saved
        </Link>
      </div>
      <AppDataTable
        table={table}
        className="table table-zebra table-sm"
        wrapperClassName="overflow-x-auto rounded-lg border border-base-300"
      />
      <TableBulkActionBar
        selectedCount={selectedQueries.length}
        selectedLabel={selectedQueries.length === 1 ? "query" : "queries"}
        onClear={() => setRowSelection({})}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={
                save.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )
              }
              onClick={() => save.mutate(selectedQueries)}
              disabled={save.isPending}
            >
              Save as keywords
            </TableBulkActionButton>
          </div>
        }
      />
    </div>
  );
}
