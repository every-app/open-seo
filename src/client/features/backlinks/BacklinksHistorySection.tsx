import { Link } from "@tanstack/react-router";
import { Clock, History, Link2, X } from "@/client/components/icons";
import type { BacklinksSearchHistoryItem } from "@/client/hooks/useBacklinksSearchHistory";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";
import { toScopeSearchParam } from "@/shared/researchScope";

import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
type Props = {
  projectId: string;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
};

export function BacklinksHistorySection({
  projectId,
  history,
  historyLoaded,
  onRemoveHistoryItem,
}: Props) {
  if (!historyLoaded) {
    return null;
  }

  if (history.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground space-y-2">
        <Link2 className="size-9 mx-auto opacity-35" />
        <p className="text-base font-medium text-foreground">
          Enter a domain or URL to get started
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {history.length} recent search{history.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {history.map((item) => (
          <div
            key={item.timestamp}
            className="group flex items-center gap-2 rounded-xl border border-border p-2"
          >
            <Link
              to="/p/$projectId/backlinks"
              params={{ projectId }}
              search={(prev) => ({
                ...prev,
                target: item.target,
                scope: toScopeSearchParam(item.target, item.scope),
                tab: undefined,
                page: undefined,
                sort: undefined,
                order: undefined,
              })}
              replace
              className="flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1 py-1 text-left transition-colors hover:bg-muted"
            >
              <Clock className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {item.target}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {RESEARCH_SCOPE_LABELS[item.scope]}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">
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
    </Card>
  );
}
