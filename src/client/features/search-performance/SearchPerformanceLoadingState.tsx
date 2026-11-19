import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Skeleton } from "@/client/components/ui/skeleton";

// Skeleton loading state for the Search Performance (GSC) page. Mirrors the
// loaded layout (filters, the metric chart, then the tabbed table panel) so the
// shell stays put and only the data fills in, matching the other pages' loaders
// (e.g. DomainOverviewLoadingState, KeywordResearchLoadingState).
export function SearchPerformanceLoadingState() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-56" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-4 border-b border-border px-4 py-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>

        <SkeletonTableRows columns={4} className="p-4" />
      </div>
    </div>
  );
}
