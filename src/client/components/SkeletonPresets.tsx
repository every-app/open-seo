import { cn } from "cn";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";

// Loading layouts built from the shadcn Skeleton primitive.

/** A row of stat cards: a small label over a large value. */
export function SkeletonStatGrid({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
      aria-busy
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-border bg-card p-4"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Table body rows. The first column is twice as wide, for the row label. */
export function SkeletonTableRows({
  rows = 8,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns + 1}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: columns }, (_cell, column) => (
            <Skeleton
              key={column}
              className={cn("h-4", column === 0 && "col-span-2")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A card of table rows, for a section whose data has not arrived. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={className} aria-busy>
      <CardContent>
        <SkeletonTableRows rows={6} columns={4} />
      </CardContent>
    </Card>
  );
}

/**
 * A whole page whose data has not arrived: the standard page frame with a
 * header and one card, so the real page replaces it without a jump.
 */
export function SkeletonPage() {
  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <SkeletonPageContent className="mx-auto max-w-7xl" />
    </div>
  );
}

/** SkeletonPage without the page frame, for layouts that already provide it. */
export function SkeletonPageContent({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)} aria-busy>
      {/* Line boxes the size of PageHeader's title and description. */}
      <div className="space-y-1">
        <div className="flex h-8 items-center">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
      </div>
      <SkeletonCard />
    </div>
  );
}
