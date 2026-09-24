import { Card } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
export function KeywordResearchLoadingState() {
  return (
    <div className="flex-1 w-full">
      <div className="hidden md:flex h-full gap-4">
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <Card className="p-4">
            <Skeleton className="h-5 w-56" />
          </Card>
          <Card className="flex-1 overflow-hidden">
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
          </Card>
        </div>
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <Card className="p-4 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-56 w-full" />
          </Card>
          <Card className="flex-1 p-4 space-y-3">
            <Skeleton className="h-4 w-44" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[24px_1fr_72px] gap-2">
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-3 w-10/12" />
                <Skeleton className="h-3 w-12 justify-self-end" />
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        <Card className="p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </Card>
        <Card className="p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <Skeleton className="h-4 w-9/12" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
