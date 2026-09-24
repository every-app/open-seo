import { Spinner } from "@/client/components/ui/spinner";

export function SavedKeywordsStatus({
  totalCount,
  isFetching,
}: {
  totalCount: number;
  isFetching: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <span>
        {totalCount.toLocaleString()} saved keyword
        {totalCount === 1 ? "" : "s"}
      </span>
      {isFetching ? <Spinner size="sm" /> : null}
    </div>
  );
}
