// Skeleton loading state for the Search Performance (GSC) page. Mirrors the
// loaded layout — four totals cards over a tabbed table panel — so the shell
// stays put and only the data fills in, matching the other pages' loaders
// (e.g. DomainOverviewLoadingState, KeywordResearchLoadingState).
export function SearchPerformanceLoadingState() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-2"
          >
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-24" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-8 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="skeleton h-8 w-36" />
            <div className="skeleton h-8 w-36" />
            <div className="skeleton h-8 w-36" />
          </div>
        </div>

        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-5 gap-3">
              <div className="skeleton col-span-2 h-4" />
              <div className="skeleton h-4" />
              <div className="skeleton h-4" />
              <div className="skeleton h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
