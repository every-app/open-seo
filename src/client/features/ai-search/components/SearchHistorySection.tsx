import type { ComponentType, ReactNode } from "react";
import { Clock, History, X } from "lucide-react";

import { Button } from "@/client/components/ui/button";
type Props<TItem extends { timestamp: number }> = {
  history: TItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
  /**
   * Renders the clickable area of a history row. The caller is responsible
   * for wrapping `content` in a <Link> (or other clickable element) so that
   * cmd+click and right-click → "open in new tab" behave natively.
   */
  renderItemLink: (item: TItem, content: ReactNode) => ReactNode;
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
  renderItemLink,
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
      <section className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-center text-muted-foreground space-y-2">
        <EmptyIcon className="size-9 mx-auto opacity-35" />
        <p className="text-base font-medium text-foreground">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground/70" />
          <span className="text-sm text-muted-foreground">
            {history.length} recent {noun}
            {history.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {history.map((item) => (
          <div
            key={item.timestamp}
            className="group flex items-center gap-2 rounded-lg border border-border bg-card p-2"
          >
            {renderItemLink(
              item,
              <>
                <Clock className="size-4 text-muted-foreground/70 shrink-0" />
                <div className="min-w-0">{renderItem(item)}</div>
              </>,
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground/70">
                {new Date(item.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-7 px-2.5 opacity-0 group-hover:opacity-100 p-1"
                onClick={() => onRemoveHistoryItem(item.timestamp)}
                aria-label="Remove from history"
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const HISTORY_ITEM_LINK_CLASS =
  "flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted";
