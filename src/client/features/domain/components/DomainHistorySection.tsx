import { Clock, History, X } from "lucide-react";
import { Globe } from "lucide-react";
import type { DomainHistoryItem } from "@/client/features/domain/types";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";

import { Button } from "@/client/components/ui/button";
type Props = {
  history: DomainHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: DomainHistoryItem) => void;
};

export function DomainHistorySection({
  history,
  historyLoaded,
  onRemoveHistoryItem,
  onSelectHistoryItem,
}: Props) {
  if (!historyLoaded) {
    return null;
  }

  if (history.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-center text-muted-foreground space-y-2">
        <Globe className="size-9 mx-auto opacity-35" />
        <p className="text-base font-medium text-foreground">
          Enter a domain to get started
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground/70" />
          <span className="text-sm text-muted-foreground">
            {history.length} recent search{history.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {history.map((item) => (
          <div
            key={item.timestamp}
            className="group flex items-center gap-2 rounded-lg border border-border bg-card p-2"
          >
            <Button
              variant="ghost"
              className="h-auto justify-start whitespace-normal text-left font-normal text-inherit flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted"
              onClick={() => onSelectHistoryItem(item)}
            >
              <Clock className="size-4 text-muted-foreground/70 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {item.domain}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {RESEARCH_SCOPE_LABELS[item.scope]}
                </p>
              </div>
            </Button>
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
