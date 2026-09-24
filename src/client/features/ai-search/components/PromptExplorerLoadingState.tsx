import { Skeleton } from "@/client/components/ui/skeleton";
type Props = {
  modelCount: number;
};

export function PromptExplorerLoadingState({ modelCount }: Props) {
  const count = Math.max(1, modelCount);
  return (
    <div className="space-y-5" aria-busy>
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={index}
          className="overflow-hidden rounded-r-lg border border-border border-l-4 border-l-border bg-card"
        >
          <header className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </header>
          <div className="space-y-2 px-5 py-5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-10/12" />
            <Skeleton className="h-3 w-9/12" />
          </div>
        </article>
      ))}
    </div>
  );
}
