import { ChevronDown, Download, FileDown, Loader2, Sheet } from "lucide-react";

export function SavedKeywordsHeader({
  totalCount,
  exporting,
  onExportCsv,
  onExportSheets,
}: {
  totalCount: number;
  exporting: "csv" | "sheets" | null;
  onExportCsv: () => void;
  onExportSheets: () => void;
}) {
  const disabled = totalCount === 0 || exporting != null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Saved Keywords</h1>
        <p className="text-sm text-base-content/70">
          Save keyword ideas from research, organize them with tags, and revisit
          when you&apos;re ready to act.
        </p>
      </div>

      <div className="dropdown dropdown-end">
        <button
          type="button"
          tabIndex={0}
          disabled={disabled}
          aria-haspopup="menu"
          className={`btn btn-ghost btn-sm gap-1.5 ${disabled ? "btn-disabled" : ""}`}
        >
          {exporting != null ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export
          <ChevronDown className="size-3 opacity-60" />
        </button>
        <ul
          tabIndex={0}
          role="menu"
          className="dropdown-content menu z-10 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <li>
            <button type="button" onClick={onExportSheets} disabled={disabled}>
              <Sheet className="size-4" />
              Export to Sheets
            </button>
          </li>
          <li>
            <button type="button" onClick={onExportCsv} disabled={disabled}>
              <FileDown className="size-4" />
              Export CSV
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
