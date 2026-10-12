import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Card } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";

export function BacklinksLoadingState() {
  return (
    <Card className="gap-0 py-0" aria-busy>
      <div className="space-y-2 px-4 pt-4 pb-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-border p-3 md:col-span-2 xl:col-span-1">
          <SkeletonTableRows rows={9} columns={2} />
        </div>
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-56 w-full" />
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="space-y-4 rounded-xl border border-border p-4">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-96" />
          <SkeletonTableRows />
        </div>
      </div>
    </Card>
  );
}
