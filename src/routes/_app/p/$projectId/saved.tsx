import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
// Aliased: `SavedKeywordsPage` has a local `sort` const (the saved-keyword
// sort key) that would otherwise shadow this import at the call site.
import { sort as sortArray } from "remeda";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  OnChangeFn,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SavedKeywordsBulkActionBar } from "@/client/features/saved-keywords/SavedKeywordsBulkActionBar";
import { SavedKeywordsBulkTagsModal } from "@/client/features/saved-keywords/SavedKeywordsBulkTagsModal";
import { SavedKeywordsFilters } from "@/client/features/saved-keywords/SavedKeywordsFilters";
import { SavedKeywordsHeader } from "@/client/features/saved-keywords/SavedKeywordsHeader";
import {
  DeleteSavedKeywordsModal,
  RemoveSavedKeywordsError,
} from "@/client/features/saved-keywords/SavedKeywordsModals";
import { SavedKeywordsTable } from "@/client/features/saved-keywords/SavedKeywordsTable";
import {
  compileSavedKeywordsFilters,
  EMPTY_SAVED_KEYWORDS_FILTERS,
} from "@/client/features/saved-keywords/savedKeywordsFilterTypes";
import {
  SAVED_KEYWORD_PAGE_SIZES,
  toSavedKeywordSort,
} from "@/client/features/saved-keywords/savedKeywordsUtils";
import { useSavedKeywordsExport } from "@/client/features/saved-keywords/useSavedKeywordsExport";
import { useSavedKeywordsFilters } from "@/client/features/saved-keywords/useSavedKeywordsFilters";
import { useTagManage } from "@/client/features/saved-keywords/useTagManage";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  filterValuesFromSearch,
  filterValuesToSearch,
  normalizeFilterValues,
} from "@/client/lib/filterSearchParams";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  getSavedKeywords,
  refreshSavedKeywordMetrics,
  removeSavedKeywords,
  updateSavedKeywordTags,
} from "@/serverFunctions/keywords";
import type { SavedKeywordTag } from "@/types/keywords";
import {
  savedKeywordsSearchSchema,
  type SavedKeywordsSearch,
} from "@/types/schemas/keywords";

export const Route = createFileRoute("/_app/p/$projectId/saved")({
  validateSearch: savedKeywordsSearchSchema,
  // The project switcher keeps this page; filter drafts must not follow.
  remountDeps: ({ params }) => params.projectId,
  search: {
    middlewares: [
      stripSearchParams({
        sort: "fetchedAt",
        order: "desc",
        page: 1,
        size: 50,
      }),
    ],
  },
  component: SavedKeywordsPage,
});

const FILTER_DEBOUNCE_MS = 350;

function sortingFromSearch(search: SavedKeywordsSearch): SortingState {
  const sort = search.sort ?? "fetchedAt";
  if (sort === "createdAt") return [];
  return [{ id: sort, desc: (search.order ?? "desc") === "desc" }];
}

function SavedKeywordsPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const setSearch = (update: Partial<SavedKeywordsSearch>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...update }),
      replace: true,
    });
  };
  const selectedTagIds = useMemo(() => search.tags ?? [], [search.tags]);
  const setSelectedTagIds = (tagIds: string[]) =>
    setSearch({
      tags: tagIds.length > 0 ? tagIds : undefined,
      page: undefined,
    });
  const [showFilters, setShowFilters] = useState(false);
  const page = search.page ?? 1;
  const pageSize = search.size ?? 50;
  const sorting = useMemo(() => sortingFromSearch(search), [search]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const { include, exclude, minVol, maxVol, minCpc, maxCpc, minKd, maxKd } =
    search;
  // Keyed on the filter params only, so a tag, sort, or page change keeps
  // the unapplied form draft.
  const committedFilterValues = useMemo(
    () =>
      filterValuesFromSearch(
        { include, exclude, minVol, maxVol, minCpc, maxCpc, minKd, maxKd },
        EMPTY_SAVED_KEYWORDS_FILTERS,
      ),
    [include, exclude, minVol, maxVol, minCpc, maxCpc, minKd, maxKd],
  );
  const filters = useSavedKeywordsFilters(committedFilterValues);
  const committedFilterKey = JSON.stringify(committedFilterValues);

  // True from a filter write until the URL changes. Any other URL change
  // (a sidebar link, for example) resets the form to the URL.
  const awaitingFilterWriteRef = useRef(false);
  const { filtersForm } = filters;
  useEffect(() => {
    if (awaitingFilterWriteRef.current) {
      awaitingFilterWriteRef.current = false;
      return;
    }
    filtersForm.reset(committedFilterValues);
  }, [committedFilterValues, filtersForm]);

  // The form holds the typed draft; it reaches the URL after a pause.
  useEffect(() => {
    const next = normalizeFilterValues(
      filters.values,
      EMPTY_SAVED_KEYWORDS_FILTERS,
    );
    if (JSON.stringify(next) === committedFilterKey) return;
    const timer = window.setTimeout(() => {
      awaitingFilterWriteRef.current = true;
      void navigate({
        search: (prev) => ({
          ...prev,
          ...filterValuesToSearch<SavedKeywordsSearch>(next),
          page: undefined,
        }),
        replace: true,
      });
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [committedFilterKey, filters.values, navigate]);

  const appliedFilters = useMemo(
    () => compileSavedKeywordsFilters(committedFilterValues),
    [committedFilterValues],
  );
  const visibleFilters = useMemo(
    () => compileSavedKeywordsFilters(filters.values),
    [filters.values],
  );

  const sortState = sorting[0];
  const sort = toSavedKeywordSort(sortState?.id);
  const order: "asc" | "desc" = sortState
    ? sortState.desc
      ? "desc"
      : "asc"
    : "desc";
  const tagFilterKey = selectedTagIds.join("|");
  const hasActiveFilters =
    filters.activeFilterCount > 0 || selectedTagIds.length > 0;

  const queryInput = useMemo(
    () => ({
      projectId,
      ...appliedFilters,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      page,
      pageSize,
      sort,
      order,
    }),
    [appliedFilters, order, page, pageSize, projectId, selectedTagIds, sort],
  );

  const savedKeywordsQuery = useQuery({
    queryKey: ["savedKeywords", projectId, queryInput],
    queryFn: () => getSavedKeywords({ data: queryInput }),
    placeholderData: keepPreviousData,
  });
  const { data, isLoading, isFetching } = savedKeywordsQuery;

  const savedKeywords = data?.rows ?? [];
  const availableTags = data?.tags ?? [];
  const totalCount = data?.totalCount ?? 0;
  const selectedRows = savedKeywords.filter((row) => rowSelection[row.id]);
  const selectedIds = selectedRows.map((row) => row.id);
  const selectedCount = selectedIds.length;

  const selectedRowTags = useMemo<SavedKeywordTag[]>(() => {
    const map = new Map<string, SavedKeywordTag>();
    for (const row of selectedRows) {
      for (const tag of row.tags) {
        if (!map.has(tag.id)) map.set(tag.id, tag);
      }
    }
    return sortArray([...map.values()], (a, b) =>
      a.normalizedName.localeCompare(b.normalizedName),
    );
  }, [selectedRows]);

  useEffect(() => {
    setRowSelection({});
  }, [page, pageSize, appliedFilters, tagFilterKey, sort, order]);

  const invalidateSavedKeywords = () =>
    queryClient.invalidateQueries({ queryKey: ["savedKeywords", projectId] });

  const removeMutation = useMutation({
    mutationFn: (savedKeywordIds: string[]) =>
      removeSavedKeywords({ data: { projectId, savedKeywordIds } }),
    onSuccess: (result) => {
      setRowSelection({});
      setShowConfirm(false);
      setRemoveError(null);
      void invalidateSavedKeywords();
      captureClientEvent("saved_keywords:bulk_remove", {
        count: result.deletedCount,
      });
      toast.success(
        `${result.deletedCount} keyword${result.deletedCount !== 1 ? "s" : ""} removed`,
      );
    },
    onError: (error) => {
      setRemoveError(getStandardErrorMessage(error, "Remove failed."));
    },
  });

  const tagMutation = useMutation({
    mutationFn: (input: {
      savedKeywordIds: string[];
      addTags?: string[];
      removeTagIds?: string[];
    }) =>
      updateSavedKeywordTags({
        data: {
          projectId,
          savedKeywordIds: input.savedKeywordIds,
          addTags: input.addTags,
          removeTagIds: input.removeTagIds,
        },
      }),
    onSuccess: (result) => {
      setRowSelection({});
      setShowTagModal(false);
      void invalidateSavedKeywords();
      toast.success(
        `Updated tags for ${result.taggedCount} keyword${result.taggedCount !== 1 ? "s" : ""}`,
      );
    },
  });

  const refreshMetricsMutation = useMutation({
    mutationFn: () => refreshSavedKeywordMetrics({ data: { projectId } }),
    onSuccess: (result) => {
      void invalidateSavedKeywords();
      toast.success(
        `Updated stats for ${result.updated} keyword${result.updated !== 1 ? "s" : ""}`,
      );
    },
  });

  const tagManage = useTagManage(projectId);
  const exporter = useSavedKeywordsExport({
    projectId,
    // The visible filters, so an export started inside the debounce window
    // still matches what the user picked.
    appliedFilters: visibleFilters,
    selectedTagIds,
    sort,
    order,
  });

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = (
      typeof updater === "function" ? updater(sorting) : updater
    )[0];
    setSearch({
      sort: next ? toSavedKeywordSort(next.id) : "createdAt",
      order: next && !next.desc ? "asc" : undefined,
      page: undefined,
    });
  };

  const handleDeleteTag = async (tagId: string) => {
    const ok = await tagManage.deleteTag(tagId);
    if (ok) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    }
  };

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <SavedKeywordsHeader
          totalCount={totalCount}
          exporting={exporter.exporting}
          metricsRefreshing={refreshMetricsMutation.isPending}
          onExportCsv={() => void exporter.exportFiltered("csv")}
          onExportSheets={() => void exporter.exportFiltered("sheets")}
          onRefreshMetrics={() => refreshMetricsMutation.mutate()}
        />

        {removeError ? (
          <RemoveSavedKeywordsError message={removeError} />
        ) : null}
        {savedKeywordsQuery.isError ? (
          <QueryError
            error={savedKeywordsQuery.error}
            fallback="Failed to load saved keywords."
            onRetry={() => void savedKeywordsQuery.refetch()}
            isRetrying={isFetching}
          />
        ) : null}
        {/* Without data a failed load has nothing to show; the empty
            state would claim there are no saved keywords. */}
        {savedKeywordsQuery.isError && data === undefined ? null : (
          <SavedKeywordsTable
            rows={savedKeywords}
            rowSelection={rowSelection}
            sorting={sorting}
            isLoading={isLoading}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={() => {
              filters.resetFilters();
              setSelectedTagIds([]);
            }}
            onRowSelectionChange={setRowSelection}
            onSortingChange={handleSortingChange}
            toolbar={
              <SavedKeywordsFilters
                filtersForm={filters.filtersForm}
                activeFilterCount={filters.activeFilterCount}
                showFilters={showFilters}
                onToggleFilters={() => setShowFilters((v) => !v)}
                onResetFilters={filters.resetFilters}
                availableTags={availableTags}
                selectedTagIds={selectedTagIds}
                busyTagIds={tagManage.busyTagIds}
                onSelectedTagIdsChange={setSelectedTagIds}
                onUpdateTag={(input) => void tagManage.updateTag(input)}
                onDeleteTag={(tagId) => void handleDeleteTag(tagId)}
              />
            }
            footer={
              <TablePagination
                page={page}
                pageSize={pageSize}
                pageSizes={SAVED_KEYWORD_PAGE_SIZES}
                totalCount={totalCount}
                isLoading={isFetching}
                onPageChange={(nextPage) => setSearch({ page: nextPage })}
                onPageSizeChange={(nextPageSize) =>
                  setSearch({ size: nextPageSize, page: undefined })
                }
              />
            }
          />
        )}

        <SavedKeywordsBulkActionBar
          selectedCount={selectedCount}
          exportingSelection={exporter.exportingSelection}
          onCopy={() => {
            navigator.clipboard
              .writeText(selectedRows.map((row) => row.keyword).join("\n"))
              .then(
                () =>
                  toast.success(
                    `${selectedCount} keyword${selectedCount !== 1 ? "s" : ""} copied`,
                  ),
                () => toast.error("Could not copy to clipboard"),
              );
          }}
          onOpenTags={() => setShowTagModal(true)}
          onExportCsv={() => void exporter.exportSelection("csv", selectedRows)}
          onExportSheets={() =>
            void exporter.exportSelection("sheets", selectedRows)
          }
          onDelete={() => setShowConfirm(true)}
          onClear={() => setRowSelection({})}
        />

        {showConfirm ? (
          <DeleteSavedKeywordsModal
            selectedCount={selectedCount}
            isPending={removeMutation.isPending}
            onClose={() => setShowConfirm(false)}
            onConfirm={() => removeMutation.mutate(selectedIds)}
          />
        ) : null}

        {showTagModal ? (
          <SavedKeywordsBulkTagsModal
            availableTags={availableTags}
            selectedCount={selectedCount}
            selectedRowTags={selectedRowTags}
            isPending={tagMutation.isPending}
            onClose={() => setShowTagModal(false)}
            onApply={({ addTags, removeTagIds }) =>
              tagMutation.mutate({
                savedKeywordIds: selectedIds,
                addTags,
                removeTagIds,
              })
            }
          />
        ) : null}
      </div>
    </div>
  );
}
