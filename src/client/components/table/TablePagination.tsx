import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Spinner } from "@/client/components/ui/spinner";

export type PageButtonProps = {
  page: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
  onPageChange: (nextPage: number) => void;
};

type Props<TSize extends number> = {
  page: number;
  pageSize: number;
  /** Omit for a fixed page size: the footer hides the "Rows per page" select. */
  pageSizes?: readonly TSize[];
  totalCount: number | null;
  /** Used only when `totalCount` is unknown. */
  hasNextPage?: boolean;
  isLoading?: boolean;
  /**
   * For pages of different sizes (keyword research keeps a keyword family on
   * one page). Rows are 1-based and inclusive.
   */
  pageRange?: { start: number; end: number; pageCount: number };
  /** Keep "Next" enabled on the last page and label it, to load more rows. */
  loadMoreLabel?: string;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: TSize) => void;
  /** Render prev/next as links, for pages whose number lives in the URL. */
  renderPageButton?: (props: PageButtonProps) => ReactNode;
};

export function TablePagination<TSize extends number>({
  page,
  pageSize,
  pageSizes,
  totalCount,
  hasNextPage = false,
  isLoading = false,
  pageRange,
  loadMoreLabel,
  onPageChange,
  onPageSizeChange,
  renderPageButton = PageButton,
}: Props<TSize>) {
  const totalPages =
    pageRange?.pageCount ??
    (totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null);
  const isOutOfRange = totalPages != null && page > totalPages;
  const currentPage = isOutOfRange ? totalPages : page;
  const isLastPage = totalPages != null && currentPage >= totalPages;
  const canGoPrev = currentPage > 1;
  const canGoNext = totalPages != null ? !isLastPage : hasNextPage;

  // A page can fall past the end when rows are removed or a stale URL is
  // opened. Move to the last page instead of showing an empty table.
  useEffect(() => {
    if (isOutOfRange && !isLoading) onPageChange(currentPage);
  }, [currentPage, isLoading, isOutOfRange, onPageChange]);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <span className="whitespace-nowrap">
          {formatRange(currentPage, pageSize, totalCount, pageRange)}
        </span>
        {isLoading ? <Spinner className="size-3.5" /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {pageSizes && onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Rows per page</span>
            <Select
              value={pageSize}
              onValueChange={(value) => {
                const size = pageSizes.find((option) => option === value);
                if (size != null) onPageSizeChange(size);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-20"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            Page {currentPage.toLocaleString()}
            {totalPages != null ? ` of ${totalPages.toLocaleString()}` : ""}
          </span>
          <div className="flex items-center gap-1">
            {renderPageButton({
              page: currentPage - 1,
              disabled: !canGoPrev || isLoading,
              label: "Previous page",
              children: <ChevronLeft />,
              onPageChange,
            })}
            {isLastPage && loadMoreLabel != null ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={() => onPageChange(currentPage + 1)}
              >
                {loadMoreLabel}
                <ChevronRight data-icon="inline-end" />
              </Button>
            ) : (
              renderPageButton({
                page: currentPage + 1,
                disabled: !canGoNext || isLoading,
                label: "Next page",
                children: <ChevronRight />,
                onPageChange,
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  page,
  disabled,
  label,
  children,
  onPageChange,
}: PageButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={() => onPageChange(page)}
    >
      {children}
    </Button>
  );
}

function formatRange(
  page: number,
  pageSize: number,
  totalCount: number | null,
  pageRange: Props<number>["pageRange"],
) {
  if (totalCount === 0) return "0";
  const start = pageRange?.start ?? (page - 1) * pageSize + 1;
  const pageEnd = pageRange?.end ?? start + pageSize - 1;
  if (totalCount == null) {
    return `${start.toLocaleString()}–${pageEnd.toLocaleString()}`;
  }
  const end = Math.min(totalCount, pageEnd);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${totalCount.toLocaleString()}`;
}
