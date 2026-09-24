import { ChevronLeft, ChevronRight } from "@/client/components/icons";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DOMAIN_KEYWORDS_PAGE_SIZES } from "@/types/schemas/domain";

import { NativeSelect } from "@/client/components/ui/native-select";
import { Spinner } from "@/client/components/ui/spinner";
import { buttonVariants } from "@/client/components/ui/button";

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
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <span>{formatRange(page, pageSize, totalCount)}</span>
        {isLoading ? <Spinner size="sm" /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Rows per page</span>
          <NativeSelect
            className="w-20 h-8 text-sm"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {DOMAIN_KEYWORDS_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
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
      className={buttonVariants({
        variant: "ghost",
        size: "icon",
        className: `size-8 ${disabled ? "pointer-events-none opacity-40" : ""}`,
      })}
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
