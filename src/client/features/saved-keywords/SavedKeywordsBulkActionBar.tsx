import {
  ChevronDown,
  Copy,
  Download,
  FileDown,
  Loader2,
  Sheet,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

export function SavedKeywordsBulkActionBar({
  selectedCount,
  onCopy,
  onOpenTags,
  onExportCsv,
  onExportSheets,
  onDelete,
  onClear,
  exportingSelection,
}: {
  selectedCount: number;
  onCopy: () => void;
  onOpenTags: () => void;
  onExportCsv: () => void;
  onExportSheets: () => void;
  onDelete: () => void;
  onClear: () => void;
  exportingSelection: "csv" | "sheets" | null;
}) {
  if (selectedCount === 0) return null;
  const exportBusy = exportingSelection != null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="pointer-events-auto flex items-stretch overflow-visible rounded-xl border border-base-content/15 bg-base-300/85 shadow-2xl backdrop-blur"
      >
        <div className="flex items-center gap-2 border-r border-base-content/10 px-3 py-2 text-sm">
          <button
            type="button"
            aria-label="Clear selection"
            className="-ml-1 rounded p-1 text-base-content/55 hover:bg-base-content/10 hover:text-base-content"
            onClick={onClear}
          >
            <X className="size-3.5" />
          </button>
          <span className="font-medium tabular-nums">{selectedCount}</span>
          <span className="text-base-content/60">selected</span>
        </div>

        <div className="flex items-center gap-0.5 px-1.5">
          <ActionButton
            icon={<Tags className="size-3.5" />}
            onClick={onOpenTags}
          >
            Tag
          </ActionButton>

          <div className="dropdown dropdown-top dropdown-end">
            <button
              type="button"
              tabIndex={0}
              disabled={exportBusy}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-base-content/85 hover:bg-base-content/10 disabled:opacity-50"
            >
              {exportBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export
              <ChevronDown className="size-3 opacity-60" />
            </button>
            <ul
              tabIndex={0}
              role="menu"
              className="dropdown-content menu z-10 mb-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
            >
              <li>
                <button type="button" onClick={onCopy}>
                  <Copy className="size-4" />
                  Copy keywords
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onExportSheets}
                  disabled={exportBusy}
                >
                  <Sheet className="size-4" />
                  Export to Sheets
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onExportCsv}
                  disabled={exportBusy}
                >
                  <FileDown className="size-4" />
                  Export CSV
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex items-center border-l border-base-content/10 px-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-error hover:bg-error/10"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-base-content/85 hover:bg-base-content/10 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}
