import { useState } from "react";
import { MoreHorizontal, Play, Download, Copy } from "lucide-react";

export function ActionsMenu({
  onCheckNow,
  onExport,
  onCopyKeywords,
  isRunning,
  hasData,
}: {
  onCheckNow: () => void;
  onExport: () => void;
  onCopyKeywords: () => void;
  isRunning: boolean;
  hasData: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="btn btn-ghost btn-sm gap-1"
        onClick={() => setOpen((c) => !c)}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-base-300 bg-base-100 shadow-lg py-1 min-w-[160px]">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-base-200"
              onClick={() => {
                onCheckNow();
                setOpen(false);
              }}
              disabled={isRunning}
            >
              <Play className="size-3.5" />
              {isRunning ? "Running..." : "Check Now"}
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-base-200"
              onClick={() => {
                onExport();
                setOpen(false);
              }}
              disabled={!hasData}
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-base-200"
              onClick={() => {
                onCopyKeywords();
                setOpen(false);
              }}
              disabled={!hasData}
            >
              <Copy className="size-3.5" />
              Copy Keywords
            </button>
          </div>
        </>
      )}
    </div>
  );
}
