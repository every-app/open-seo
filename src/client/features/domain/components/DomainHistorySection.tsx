import { Clock, History, X } from "lucide-react";
import { Globe } from "lucide-react";
import type { DomainHistoryItem } from "@/client/features/domain/types";

type Props = {
  historyLoaded: boolean;
  history: DomainHistoryItem[];
  onClearHistory: () => void;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: DomainHistoryItem) => void;
};

export function DomainHistorySection({
  historyLoaded,
  history,
  onClearHistory,
  onRemoveHistoryItem,
  onSelectHistoryItem,
}: Props) {
  if (!historyLoaded || history.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/55 space-y-2">
        <Globe className="size-9 mx-auto opacity-35" />
        <p className="text-base font-medium text-base-content/80">
          Enter a domain to get started
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-base-content/45" />
          <span className="text-sm text-base-content/60">
            {history.length} recent search{history.length !== 1 ? "es" : ""}
          </span>
        </div>
        <button
          className="btn btn-ghost btn-xs text-error"
          onClick={onClearHistory}
        >
          Clear all
        </button>
      </div>

      <div className="grid gap-2">
        {history.map((item) => (
          <div
            key={item.timestamp}
            className="flex items-center justify-between p-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 transition-colors text-left group cursor-pointer"
            onClick={() => onSelectHistoryItem(item)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="size-4 text-base-content/40 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-base-content truncate">
                  {item.domain}
                </p>
                <p className="text-sm text-base-content/60 truncate">
                  {item.subdomains ? "Include subdomains" : "Root domain only"}
                  {item.search?.trim() ? ` - ${item.search}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-base-content/40">
                {new Date(item.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveHistoryItem(item.timestamp);
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
