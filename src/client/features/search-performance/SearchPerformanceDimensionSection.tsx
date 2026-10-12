import type { UseQueryResult } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { DimensionTable } from "@/client/features/search-performance/SearchPerformanceParts";
import type { getSearchPerformanceTable } from "@/serverFunctions/searchPerformance";
import { SEARCH_PERFORMANCE_PAGE_SIZES } from "@/types/schemas/search-performance";

/** The Queries or Pages tab body: loading, error with retry, reconnect, or the paged table. */
export function DimensionSection({
  projectId,
  tableQuery,
  keyLabel,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isFiltered,
  onClearFilters,
}: {
  projectId: string;
  tableQuery: UseQueryResult<
    Awaited<ReturnType<typeof getSearchPerformanceTable>>
  >;
  keyLabel: string;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  if (tableQuery.isPending) {
    return <SkeletonTableRows className="p-4" />;
  }

  const error = tableQuery.isError ? (
    <div className="px-4 pt-4">
      <QueryError
        error={tableQuery.error}
        fallback="Failed to load Search Console data"
        onRetry={() => void tableQuery.refetch()}
        isRetrying={tableQuery.isFetching}
      />
    </div>
  ) : null;

  const tableData = tableQuery.data;
  if (!tableData) return <div className="pb-4">{error}</div>;

  // The grant died after the report loaded as connected.
  if (!tableData.connected) {
    return (
      <div className="max-w-2xl p-4">
        <GoogleConnectionCard provider="gsc" projectId={projectId} />
      </div>
    );
  }

  const isPastEnd =
    page > 1 && tableData.rows.length === 0 && !tableQuery.isPlaceholderData;

  return (
    <>
      {error}
      <div className="p-4">
        <DimensionTable
          rows={tableData.rows}
          keyLabel={keyLabel}
          isFiltered={isFiltered}
          isPastEnd={isPastEnd}
          onClearFilters={onClearFilters}
          onFirstPage={() => onPageChange(1)}
        />
      </div>
      {!isPastEnd && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
          totalCount={tableData.totalCount}
          hasNextPage={tableData.hasNextPage}
          isLoading={tableQuery.isFetching}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </>
  );
}
