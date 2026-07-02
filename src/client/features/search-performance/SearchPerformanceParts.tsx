import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AppDataTable,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import {
  buildDimensionColumns,
  buildStrikingColumns,
  formatCount,
  formatCtr,
  formatPosition,
  type Report,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { saveKeywords } from "@/serverFunctions/keywords";

export type Tab = "striking" | "queries" | "pages";

export function exportCurrentTab(report: Report, tab: Tab): void {
  const stamp = `${report.range.startDate}-to-${report.range.endDate}`;
  if (tab === "striking") {
    downloadCsv(
      `search-performance-striking-distance-${stamp}.csv`,
      buildCsv(
        ["Query", "Page", "Impressions", "Clicks", "Position"],
        report.strikingDistance.map((row) => [
          row.query,
          row.page,
          row.impressions,
          row.clicks,
          row.position,
        ]),
      ),
    );
    return;
  }
  const rows = tab === "queries" ? report.queries : report.pages;
  downloadCsv(
    `search-performance-${tab}-${stamp}.csv`,
    buildCsv(
      [
        tab === "queries" ? "Query" : "Page",
        "Clicks",
        "Impressions",
        "CTR",
        "Position",
      ],
      rows.map((row) => [
        row.key,
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
      ]),
    ),
  );
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
  if (!Number.isFinite(change)) return null;
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
  const { totals, prevTotals } = report;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TotalCard
        label="Clicks"
        value={formatCount(totals.clicks)}
        delta={percentDelta(totals.clicks, prevTotals.clicks)}
      />
      <TotalCard
        label="Impressions"
        value={formatCount(totals.impressions)}
        delta={percentDelta(totals.impressions, prevTotals.impressions)}
      />
      <TotalCard
        label="CTR"
        value={formatCtr(totals.ctr)}
        delta={percentDelta(totals.ctr, prevTotals.ctr)}
      />
      <TotalCard
        label="Avg position"
        value={formatPosition(totals.position)}
        delta={positionDelta(totals.position, prevTotals.position)}
      />
    </div>
  );
}

function TotalCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: Delta;
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
            title="vs previous period"
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={selectedQueries.length === 0 || save.isPending}
            onClick={() => save.mutate(selectedQueries)}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Save {selectedQueries.length > 0 ? selectedQueries.length : ""} as
            keywords
          </button>
          <Link
            to="/p/$projectId/saved"
            params={{ projectId }}
            className="btn btn-ghost btn-sm"
          >
            View saved
          </Link>
        </div>
      </div>
      <AppDataTable
        table={table}
        className="table table-zebra table-sm"
        wrapperClassName="overflow-x-auto rounded-lg border border-base-300"
      />
    </div>
  );
}
