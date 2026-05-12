import { createFileRoute } from "@tanstack/react-router";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SavedKeywordsBulkActionBar } from "@/client/features/saved-keywords/SavedKeywordsBulkActionBar";
import { SavedKeywordsBulkTagsModal } from "@/client/features/saved-keywords/SavedKeywordsBulkTagsModal";
import { SavedKeywordsFilters } from "@/client/features/saved-keywords/SavedKeywordsFilters";
import { SavedKeywordsHeader } from "@/client/features/saved-keywords/SavedKeywordsHeader";
import {
  DeleteSavedKeywordsModal,
  RemoveSavedKeywordsError,
} from "@/client/features/saved-keywords/SavedKeywordsModals";
import { SavedKeywordsPagination } from "@/client/features/saved-keywords/SavedKeywordsPagination";
import { SavedKeywordsStatus } from "@/client/features/saved-keywords/SavedKeywordsStatus";
import { SavedKeywordsTable } from "@/client/features/saved-keywords/SavedKeywordsTable";
import { compileSavedKeywordsFilters } from "@/client/features/saved-keywords/savedKeywordsFilterTypes";
import {
  toSavedKeywordSort,
  type SAVED_KEYWORD_PAGE_SIZES,
} from "@/client/features/saved-keywords/savedKeywordsUtils";
import { useSavedKeywordsExport } from "@/client/features/saved-keywords/useSavedKeywordsExport";
import { useSavedKeywordsFilters } from "@/client/features/saved-keywords/useSavedKeywordsFilters";
import { useTagManage } from "@/client/features/saved-keywords/useTagManage";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  getSavedKeywords,
  removeSavedKeywords,
  updateSavedKeywordTags,
} from "@/serverFunctions/keywords";
import type { SavedKeywordTag } from "@/types/keywords";

export const Route = createFileRoute("/_project/p/$projectId/saved")({
  component: SavedKeywordsPage,
});

const FILTER_DEBOUNCE_MS = 350;

function SavedKeywordsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof SAVED_KEYWORD_PAGE_SIZES)[number]>(50);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fetchedAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const filters = useSavedKeywordsFilters();
  const [committedFilterValues, setCommittedFilterValues] = useState(
    filters.values,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedFilterValues(filters.values);
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.values]);

  const appliedFilters = useMemo(
    () => compileSavedKeywordsFilters(committedFilterValues),
    [committedFilterValues],
  );
  const exportFilters = useMemo(
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

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["savedKeywords", projectId, queryInput],
    queryFn: () => getSavedKeywords({ data: queryInput }),
    placeholderData: keepPreviousData,
  });

  const savedKeywords = data?.rows ?? [];
  const availableTags = data?.tags ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
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
    return [...map.values()].toSorted((a, b) =>
      a.normalizedName.localeCompare(b.normalizedName),
    );
  }, [selectedRows]);

  useEffect(() => {
    setRowSelection({});
  }, [page, pageSize, appliedFilters, tagFilterKey, sort, order]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Could not update tags"));
    },
  });

  const tagManage = useTagManage(projectId);
  const exporter = useSavedKeywordsExport({
    projectId,
    appliedFilters: exportFilters,
    selectedTagIds,
    sort,
    order,
  });

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
    setPage(1);
  };

  const handleDeleteTag = async (tagId: string) => {
    const ok = await tagManage.deleteTag(tagId);
    if (ok) {
      setSelectedTagIds((current) => current.filter((id) => id !== tagId));
    }
  };

  const handleClearAllFilters = () => {
    filters.resetFilters();
    setSelectedTagIds([]);
    setPage(1);
  };

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <SavedKeywordsHeader
          totalCount={totalCount}
          exporting={exporter.exporting}
          onExportCsv={() => void exporter.exportFilteredCsv()}
          onExportSheets={() => void exporter.exportFilteredSheets()}
        />

        <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <SavedKeywordsFilters
            filtersForm={filters.filtersForm}
            activeFilterCount={filters.activeFilterCount}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters((v) => !v)}
            onResetAllFilters={handleClearAllFilters}
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            busyTagIds={tagManage.busyTagIds}
            onToggleTagFilter={(tagId) => {
              setSelectedTagIds((current) =>
                current.includes(tagId)
                  ? current.filter((id) => id !== tagId)
                  : [...current, tagId],
              );
              setPage(1);
            }}
            onClearTagSelection={() => {
              setSelectedTagIds([]);
              setPage(1);
            }}
            onUpdateTag={(input) => void tagManage.updateTag(input)}
            onDeleteTag={(tagId) => void handleDeleteTag(tagId)}
          />

          <div className="space-y-3 p-4">
            {removeError ? (
              <RemoveSavedKeywordsError message={removeError} />
            ) : null}
            <SavedKeywordsStatus
              totalCount={totalCount}
              isFetching={isFetching && !isLoading}
            />
            <SavedKeywordsTable
              rows={savedKeywords}
              rowSelection={rowSelection}
              sorting={sorting}
              isLoading={isLoading}
              hasActiveFilters={hasActiveFilters}
              onRowSelectionChange={setRowSelection}
              onSortingChange={handleSortingChange}
            />
          </div>

          <SavedKeywordsPagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            isLoading={isFetching}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </div>

        <SavedKeywordsBulkActionBar
          selectedCount={selectedCount}
          exportingSelection={exporter.exportingSelection}
          onCopy={() => {
            void navigator.clipboard.writeText(
              selectedRows.map((row) => row.keyword).join("\n"),
            );
            toast.success(
              `${selectedCount} keyword${selectedCount !== 1 ? "s" : ""} copied`,
            );
          }}
          onOpenTags={() => setShowTagModal(true)}
          onExportCsv={() => exporter.exportSelectionCsv(selectedRows)}
          onExportSheets={() =>
            void exporter.exportSelectionSheets(selectedRows)
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
