import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SAVED_KEYWORD_PAGE_SIZES } from "./savedKeywordsUtils";

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
    <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm tabular-nums text-base-content/70">
        <span>
          {start.toLocaleString()}-{end.toLocaleString()} of{" "}
          {totalCount.toLocaleString()}
        </span>
        {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="select select-bordered select-sm w-20"
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
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-base-content/70">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
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
