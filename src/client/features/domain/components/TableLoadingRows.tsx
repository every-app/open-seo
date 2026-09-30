import { Skeleton } from "@/client/components/ui/skeleton";
export function TableLoadingRows() {
  return (
    <div className="space-y-3 py-4" aria-busy>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-3">
          <Skeleton className="h-4 col-span-2" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
      ))}
    </div>
  );
}
