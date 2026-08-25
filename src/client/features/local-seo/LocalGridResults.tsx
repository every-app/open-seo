import { useMemo, useState } from "react";
import { Clock3, MapPin } from "lucide-react";
import type {
  LocalGridResultCell,
  LocalGridResultsResponse,
} from "@/types/schemas/local-seo";
import {
  localGridCellClass,
  localGridCellLabel,
  summarizeLocalGridCells,
} from "./localGridResultUtils";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2">
      <p className="text-[11px] text-base-content/50">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function CellDetails({ cell }: { cell: LocalGridResultCell | null }) {
  if (!cell) {
    return (
      <p className="text-sm text-base-content/60">
        Select a grid point to inspect its result and coordinates.
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base-content/60">Target rank</span>
        <strong>{localGridCellLabel(cell)}</strong>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-base-content/60">Grid position</span>
        <span>
          Row {cell.rowIndex + 1}, column {cell.columnIndex + 1}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-base-content/60">Coordinates</span>
        <span className="font-mono text-xs">
          {cell.latitude.toFixed(5)}, {cell.longitude.toFixed(5)}
        </span>
      </div>
      {cell.errorMessage ? (
        <p className="rounded-lg bg-error/10 p-2 text-xs text-error">
          {cell.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function LocalGridResults({
  data,
  gridSize,
}: {
  data: LocalGridResultsResponse;
  gridSize: number;
}) {
  const [keywordId, setKeywordId] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const effectiveKeywordId = data.keywords.some(
    (keyword) => keyword.id === keywordId,
  )
    ? keywordId
    : (data.keywords[0]?.id ?? null);
  const cells = useMemo(
    () =>
      data.cells.filter(
        (cell) => cell.trackingKeywordId === effectiveKeywordId,
      ),
    [data.cells, effectiveKeywordId],
  );
  const summary = summarizeLocalGridCells(cells);
  const selectedCell =
    cells.find((cell) => cell.resultId === selectedResultId) ?? null;

  if (!data.run) {
    return (
      <div className="card border border-dashed border-base-300 bg-base-100">
        <div className="card-body items-center py-10 text-center">
          <MapPin className="size-8 text-base-content/30" />
          <h3 className="font-semibold">No scan results yet</h3>
          <p className="max-w-md text-sm text-base-content/60">
            Run the first scan to see how the business ranks at every point in
            this grid.
          </p>
        </div>
      </div>
    );
  }

  const isActive =
    data.run.status === "pending" || data.run.status === "running";
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-title text-sm">Map grid results</h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-base-content/60">
              <Clock3 className="size-3" />
              {isActive
                ? `${data.run.tasksCompleted}/${data.run.taskCount} tasks collected`
                : `Scanned ${new Date(data.run.startedAt).toLocaleString()}`}
            </p>
          </div>
          <label className="form-control w-full max-w-xs">
            <span className="label py-0 pb-1 text-xs">Keyword</span>
            <select
              className="select select-bordered select-sm"
              aria-label="Grid keyword"
              value={effectiveKeywordId ?? ""}
              onChange={(event) => {
                setKeywordId(event.target.value);
                setSelectedResultId(null);
              }}
            >
              {data.keywords.map((keyword) => (
                <option key={keyword.id} value={keyword.id}>
                  {keyword.keyword}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric
            label="Visibility"
            value={
              summary.visibilityPercent === null
                ? "—"
                : `${summary.visibilityPercent}%`
            }
          />
          <Metric label="Top 3 points" value={String(summary.topThree)} />
          <Metric
            label="Average visible rank"
            value={
              summary.averageVisibleRank === null
                ? "—"
                : summary.averageVisibleRank.toFixed(1)
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-xl border border-base-300 bg-base-200/40 p-3">
            <div
              className="mx-auto grid aspect-square w-full max-w-xl gap-2 rounded-lg bg-[radial-gradient(circle_at_center,oklch(var(--b3)/0.7)_1px,transparent_1px)] bg-[length:18px_18px] p-2"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
              }}
              aria-label="Local ranking map grid"
            >
              {cells.map((cell) => (
                <button
                  key={cell.resultId}
                  type="button"
                  className={`flex aspect-square min-w-0 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${localGridCellClass(cell)} ${selectedResultId === cell.resultId ? "ring-2 ring-primary ring-offset-2 ring-offset-base-200" : ""}`}
                  onClick={() => setSelectedResultId(cell.resultId)}
                  title={`${cell.keyword}: ${localGridCellLabel(cell)} at ${cell.latitude.toFixed(5)}, ${cell.longitude.toFixed(5)}`}
                  aria-label={`Row ${cell.rowIndex + 1}, column ${cell.columnIndex + 1}: ${localGridCellLabel(cell)}`}
                >
                  {cell.status === "pending"
                    ? "…"
                    : cell.status === "completed" && cell.targetRank === null
                      ? "—"
                      : localGridCellLabel(cell)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-base-content/60">
              <span>
                <i className="mr-1 inline-block size-2 rounded-full bg-success" />
                1–3
              </span>
              <span>
                <i className="mr-1 inline-block size-2 rounded-full bg-lime-500" />
                4–10
              </span>
              <span>
                <i className="mr-1 inline-block size-2 rounded-full bg-warning" />
                11–20
              </span>
              <span>
                <i className="mr-1 inline-block size-2 rounded-full bg-error" />
                21+
              </span>
              <span>
                <i className="mr-1 inline-block size-2 rounded-full bg-base-300" />
                Not found
              </span>
            </div>
          </div>
          <aside className="rounded-xl border border-base-300 p-4">
            <h4 className="mb-3 text-sm font-semibold">Point details</h4>
            <CellDetails cell={selectedCell} />
          </aside>
        </div>

        {data.run.errorMessage ? (
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning-content">
            {data.run.errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
