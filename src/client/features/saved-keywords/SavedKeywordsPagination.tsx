import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SAVED_KEYWORD_PAGE_SIZES } from "./savedKeywordsUtils";

import { Button } from "@/client/components/ui/button";
import { NativeSelect } from "@/client/components/ui/native-select";
export function SavedKeywordsPagination({
  page,
  pageSize,
  totalCount,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: (typeof SAVED_KEYWORD_PAGE_SIZES)[number];
  totalCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (
    pageSize: (typeof SAVED_KEYWORD_PAGE_SIZES)[number],
  ) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
        <span>
          {start.toLocaleString()}-{end.toLocaleString()} of{" "}
          {totalCount.toLocaleString()}
        </span>
        {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Rows per page</span>
          <NativeSelect
            className="w-20 h-8 text-sm"
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(parsePageSize(event.target.value))
            }
          >
            {SAVED_KEYWORD_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="size-8"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="size-8"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parsePageSize(
  value: string,
): (typeof SAVED_KEYWORD_PAGE_SIZES)[number] {
  const parsed = Number(value);
  return SAVED_KEYWORD_PAGE_SIZES.find((size) => size === parsed) ?? 50;
}
