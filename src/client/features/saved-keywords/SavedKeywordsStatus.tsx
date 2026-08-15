import { Loader2 } from "lucide-react";

export function SavedKeywordsStatus({
  totalCount,
  isFetching,
}: {
  totalCount: number;
  isFetching: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-base-content/60">
      <span>{totalCount.toLocaleString()} 个已保存关键词</span>
      {isFetching ? <Loader2 className="size-3 animate-spin" /> : null}
    </div>
  );
}
