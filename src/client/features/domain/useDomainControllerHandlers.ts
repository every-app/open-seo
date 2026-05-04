import { useCallback, type FormEvent } from "react";
import {
  getDefaultSortOrder,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import type {
  DomainControlsValues,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import { saveSelectedKeywords } from "@/client/features/domain/domainActions";
import type { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import type {
  SearchState,
  useOverviewDataState,
} from "@/client/features/domain/domainOverviewControllerInternals";
import type { DomainSearchHistoryItem } from "@/client/hooks/useDomainSearchHistory";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";

type DomainControlsFormApi = {
  state: { values: DomainControlsValues };
  handleSubmit: () => Promise<unknown>;
  reset: (values: DomainControlsValues) => void;
  setFieldValue: (
    field: keyof DomainControlsValues,
    value: string | boolean | number,
  ) => void;
};

export function useDomainControllerHandlers({
  controlsForm,
  currentSortOrder,
  currentState,
  dataState,
  projectId,
  saveMutation,
  selectedKeywords,
  setSearchParams,
}: {
  controlsForm: DomainControlsFormApi;
  currentSortOrder: SortOrder;
  currentState: SearchState;
  dataState: ReturnType<typeof useOverviewDataState>;
  projectId: string;
  saveMutation: ReturnType<typeof useSaveKeywordsMutation>;
  selectedKeywords: Set<string>;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
}) {
  const applySort = useCallback(
    (nextSort: DomainSortMode, nextOrder: SortOrder) => {
      controlsForm.setFieldValue("sort", nextSort);
      setSearchParams({
        sort: toSortSearchParam(nextSort),
        order: toSortOrderSearchParam(nextSort, nextOrder),
        page: undefined,
      });
    },
    [controlsForm, setSearchParams],
  );

  const applyLocationChange = useCallback(
    (nextLocationCode: number) => {
      if (!isSupportedLocationCode(nextLocationCode)) return;
      controlsForm.setFieldValue("locationCode", nextLocationCode);
      setSearchParams({
        loc:
          nextLocationCode === DEFAULT_LOCATION_CODE
            ? undefined
            : nextLocationCode,
      });
    },
    [controlsForm, setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: DomainSortMode) => {
      const nextOrder =
        nextSort === currentState.sort
          ? currentSortOrder === "asc"
            ? "desc"
            : "asc"
          : getDefaultSortOrder(nextSort);
      applySort(nextSort, nextOrder);
    },
    [applySort, currentSortOrder, currentState.sort],
  );

  const handleSaveKeywords = () => {
    saveSelectedKeywords({
      selectedKeywords,
      filteredKeywords: dataState.filteredKeywords,
      save: saveMutation.mutate,
      projectId,
      locationCode: currentState.locationCode,
      languageCode: getLanguageCode(currentState.locationCode),
    });
  };

  const handleHistorySelect = (item: DomainSearchHistoryItem) => {
    const historyLocation =
      item.locationCode != null && isSupportedLocationCode(item.locationCode)
        ? item.locationCode
        : DEFAULT_LOCATION_CODE;
    setSearchParams({
      domain: item.domain,
      subdomains: item.subdomains ? undefined : false,
      sort: toSortSearchParam(item.sort),
      order: undefined,
      tab: item.tab === "keywords" ? undefined : item.tab,
      search: item.search?.trim() || undefined,
      loc:
        historyLocation === DEFAULT_LOCATION_CODE ? undefined : historyLocation,
      page: undefined,
      size: undefined,
    });
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void controlsForm.handleSubmit();
  };

  return {
    applySort,
    applyLocationChange,
    handleSortColumnClick,
    handleSaveKeywords,
    handleSearchSubmit,
    handleHistorySelect,
  };
}
