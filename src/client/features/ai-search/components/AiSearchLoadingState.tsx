import { Card } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { StatCard } from "@/client/components/ui/stat-card";
export function AiSearchLoadingState() {
  return (
    <div className="space-y-8" aria-busy>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <StatCard key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3 w-40" />
          </StatCard>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Card className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-6 gap-3">
              <Skeleton className="col-span-3 h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
