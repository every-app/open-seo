import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DOMAIN_KEYWORDS_PAGE_SIZES } from "@/types/schemas/domain";

type Props = {
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasNextPage: boolean;
  isLoading: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
};

function formatRange(
  page: number,
  pageSize: number,
  totalCount: number | null,
) {
  const start = (page - 1) * pageSize + 1;
  if (totalCount == null) {
    return `${start.toLocaleString()}–${(start + pageSize - 1).toLocaleString()}`;
  }
  if (totalCount === 0) return "0";
  const end = Math.min(totalCount, start + pageSize - 1);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${totalCount.toLocaleString()}`;
}

export function DomainKeywordsPagination({
  page,
  pageSize,
  totalCount,
  hasNextPage,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const canGoPrev = page > 1;
  const canGoNext = totalPages != null ? page < totalPages : hasNextPage;

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-base-content/70 tabular-nums">
        <span>{formatRange(page, pageSize, totalCount)}</span>
        {isLoading ? (
          <span className="loading loading-spinner loading-xs" />
        ) : null}
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="select select-bordered select-sm w-20"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {DOMAIN_KEYWORDS_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-base-content/70">
            Page {page.toLocaleString()}
            {totalPages != null ? ` of ${totalPages.toLocaleString()}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <PageLink
              page={page - 1}
              disabled={!canGoPrev || isLoading}
              onPageChange={onPageChange}
              label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </PageLink>
            <PageLink
              page={page + 1}
              disabled={!canGoNext || isLoading}
              onPageChange={onPageChange}
              label="Next page"
            >
              <ChevronRight className="size-4" />
            </PageLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
  children,
  onPageChange,
}: {
  page: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
  onPageChange: (nextPage: number) => void;
}) {
  return (
    <Link
      from="/p/$projectId/domain"
      to="/p/$projectId/domain"
      search={(prev) => ({
        ...prev,
        page: page === 1 ? undefined : page,
      })}
      aria-label={label}
      aria-disabled={disabled}
      className={`btn btn-ghost btn-sm btn-square ${disabled ? "btn-disabled" : ""}`}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        onPageChange(page);
      }}
    >
      {children}
    </Link>
  );
}
