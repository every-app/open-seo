import { Skeleton } from "@/client/components/ui/skeleton";

// Mirrors KeywordResearchResults: tabs and the table below md, the SERP panel
// above the table from md, and side by side from xl.
export function KeywordResearchLoadingState() {
  return (
    <div className="flex-1 w-full flex flex-col">
      <div className="md:hidden flex border-b border-border mb-4">
        <div className="flex-1 py-2.5">
          <Skeleton className="h-4 w-28 mx-auto" />
        </div>
        <div className="flex-1 py-2.5">
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
      </div>
      <div className="flex-1 flex flex-col xl:flex-row gap-4">
        <div className="order-2 xl:order-1 flex flex-col min-w-0 gap-2 xl:basis-3/5">
          <div className="hidden md:block rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-56" />
          </div>
          <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center gap-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[24px_minmax(0,1fr)_64px_56px_48px_40px] items-center gap-3"
                >
                  <Skeleton className="h-3 w-3" />
                  <Skeleton className="h-4 w-10/12" />
                  <Skeleton className="h-3 w-12 justify-self-end" />
                  <Skeleton className="h-3 w-10 justify-self-end" />
                  <Skeleton className="h-3 w-10 justify-self-end" />
                  <Skeleton className="h-6 w-6 rounded-full justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden md:flex order-1 xl:order-2 flex-col min-w-0 gap-2 xl:basis-2/5">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-56 w-full" />
          </div>
          <div className="flex-1 rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-44" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[24px_1fr_72px] gap-2">
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-3 w-10/12" />
                <Skeleton className="h-3 w-12 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
