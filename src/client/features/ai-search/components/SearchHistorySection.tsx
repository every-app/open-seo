import type { ComponentType, ReactNode } from "react";
import { Clock, History, X } from "lucide-react";

type Props<TItem extends { timestamp: number }> = {
  history: TItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: TItem) => void;
  /** Icon component rendered in the empty state (e.g. Sparkles, MessageSquare). */
  emptyIcon: ComponentType<{ className?: string }>;
  /** Empty-state headline copy. */
  emptyMessage: string;
  /**
   * Label noun used in the "{n} recent {noun}(s)" header (e.g. "lookup",
   * "prompt"). Pluralization is handled by the component.
   */
  noun: string;
  /** Item body — primary (and optional secondary) text shown in each row. */
  renderItem: (item: TItem) => ReactNode;
};

export function SearchHistorySection<TItem extends { timestamp: number }>({
  history,
  historyLoaded,
  onRemoveHistoryItem,
  onSelectHistoryItem,
  emptyIcon: EmptyIcon,
  emptyMessage,
  noun,
  renderItem,
}: Props<TItem>) {
  if (!historyLoaded) {
    return null;
  }

  if (history.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/55 space-y-2">
        <EmptyIcon className="size-9 mx-auto opacity-35" />
        <p className="text-base font-medium text-base-content/80">
          {emptyMessage}
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
            {history.length} recent {noun}
            {history.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {history.map((item) => (
          <div
            key={item.timestamp}
            className="group flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-base-200"
              onClick={() => onSelectHistoryItem(item)}
            >
              <Clock className="size-4 text-base-content/40 shrink-0" />
              <div className="min-w-0">{renderItem(item)}</div>
            </button>
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
                onClick={() => onRemoveHistoryItem(item.timestamp)}
                aria-label="Remove from history"
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
