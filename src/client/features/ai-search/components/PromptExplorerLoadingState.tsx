import { cn } from "cn";
import { Skeleton } from "@/client/components/ui/skeleton";
import { getModelAccent } from "@/client/features/ai-search/platformLabels";
import { formatModelLabel } from "@/shared/prompt-explorer-labels";
import type { PromptExplorerModel } from "@/types/schemas/ai-search";

// Mirrors PromptExplorerResults: one answer card per selected model, named so
// the user can see which answers are on their way.
export function PromptExplorerLoadingState({
  models,
}: {
  models: PromptExplorerModel[];
}) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading answers">
      {models.map((model) => (
        <article
          key={model}
          className={cn(
            "overflow-hidden rounded-r-lg border border-l-4 border-border bg-card",
            getModelAccent(model).border,
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2 rounded-full", getModelAccent(model).dot)}
              />
              <h3 className="text-sm font-semibold">
                {formatModelLabel(model)}
              </h3>
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </header>
          <div className="space-y-2.5 px-5 py-5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="space-y-2 border-t border-border px-5 py-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </article>
      ))}
    </div>
  );
}
