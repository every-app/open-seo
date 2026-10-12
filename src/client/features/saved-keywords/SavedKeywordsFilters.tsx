import {
  DataTableFilterToggle,
  DataTableToolbar,
} from "@/client/components/table/DataTableToolbar";
import { SavedKeywordsFilterPanel } from "./SavedKeywordsFilterPanel";
import { SavedKeywordsTagFilter } from "./SavedKeywordsTagFilter";
import type { TagColorKey } from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";
import type { SavedKeywordsFilterForm } from "./useSavedKeywordsFilters";

export function SavedKeywordsFilters({
  filtersForm,
  activeFilterCount,
  showFilters,
  onToggleFilters,
  onResetFilters,
  availableTags,
  selectedTagIds,
  busyTagIds,
  onSelectedTagIdsChange,
  onUpdateTag,
  onDeleteTag,
}: {
  filtersForm: SavedKeywordsFilterForm;
  activeFilterCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  onResetFilters: () => void;
  availableTags: SavedKeywordTagSummary[];
  selectedTagIds: string[];
  busyTagIds: Set<string>;
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  onUpdateTag: (input: {
    tagId: string;
    name?: string;
    color?: TagColorKey | null;
  }) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  return (
    <>
      <DataTableToolbar
        actions={
          <SavedKeywordsTagFilter
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            busyTagIds={busyTagIds}
            onSelectedTagIdsChange={onSelectedTagIdsChange}
            onUpdateTag={onUpdateTag}
            onDeleteTag={onDeleteTag}
          />
        }
      >
        <DataTableFilterToggle
          open={showFilters}
          activeCount={activeFilterCount}
          onToggle={onToggleFilters}
        />
      </DataTableToolbar>

      {showFilters ? (
        <SavedKeywordsFilterPanel
          form={filtersForm}
          activeFilterCount={activeFilterCount}
          onReset={onResetFilters}
        />
      ) : null}
    </>
  );
}
