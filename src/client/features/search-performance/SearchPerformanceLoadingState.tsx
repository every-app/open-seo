import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Skeleton } from "@/client/components/ui/skeleton";

// Skeleton loading state for the Search Performance (GSC) page. Mirrors the
// loaded layout — a compact totals table over a tabbed table panel — so the shell
// stays put and only the data fills in, matching the other pages' loaders
// (e.g. DomainOverviewLoadingState, KeywordResearchLoadingState).
export function SearchPerformanceLoadingState() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4">
        <SkeletonTableRows rows={5} columns={3} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-36" />
          </div>
        </div>

        <SkeletonTableRows columns={4} className="p-4" />
      </div>
    </div>
  );
}
