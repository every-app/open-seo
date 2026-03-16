import { type FormEvent } from "react";
import { toast } from "sonner";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { getLanguageCode } from "@/client/features/keywords/utils";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";

type ControlsFormLike = {
  state: {
    values: {
      keyword: string;
      locationCode: number;
      resultLimit: ResultLimit;
      mode: KeywordMode;
    };
  };
};

type RunSearchLike = (
  args: {
    projectId: string;
    keywords: string[];
    locationCode: number;
    resultLimit: ResultLimit;
    mode: KeywordMode;
  },
  options: {
    onSuccess: (seedKeyword: string, nextRows: KeywordResearchRow[]) => void;
  },
) => void;

type SearchActionParams = {
  controlsForm: ControlsFormLike;
  input: KeywordResearchControllerInput;
  beginSearch: (seedKeyword: string, locationCode: number) => void;
  runSearch: RunSearchLike;
  clearSelection: () => void;
  setSelectedKeyword: (keyword: KeywordResearchRow | null) => void;
  setSerpKeyword: (keyword: string | null) => void;
  setSerpPage: (page: number) => void;
  setSearchInputError: (error: string | null) => void;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
  setPreferredLocationCode: (locationCode: number) => void;
};

type SaveExportActionParams = {
  selectedRows: Set<string>;
  filteredRows: KeywordResearchRow[];
  input: KeywordResearchControllerInput;
  saveKeywordsMutate: (
    variables: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
    },
    options: {
      onSuccess: () => void;
      onError: (error: unknown) => void;
    },
  ) => void;
  setShowSaveDialog: (show: boolean) => void;
};

function getNextSortParams(
  currentField: SortField,
  currentDirection: SortDir,
  targetField: SortField,
): { sort: SortField; order: SortDir } {
  if (currentField !== targetField) {
    return { sort: targetField, order: "desc" };
  }

  return {
    sort: currentField,
    order: currentDirection === "asc" ? "desc" : "asc",
  };
}

export function useSearchActions(params: SearchActionParams) {
  const {
    controlsForm,
    input,
    beginSearch,
    runSearch,
    clearSelection,
    setSelectedKeyword,
    setSerpKeyword,
    setSerpPage,
    setSearchInputError,
    setSearchParams,
    setPreferredLocationCode,
  } = params;

  const onSearch = (
    overrides?: Partial<{
      keyword: string;
      locationCode: number;
    }>,
  ) => {
    const values = controlsForm.state.values;
    const inputKeyword = overrides?.keyword ?? values.keyword;
    const activeLocation = overrides?.locationCode ?? values.locationCode;
    const activeResultLimit = values.resultLimit;
    const activeMode = values.mode;
    const keywords = inputKeyword
      .split(/[\n,]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      setSearchInputError("Please enter at least one keyword.");
      return;
    }

    setSearchInputError(null);
    setPreferredLocationCode(activeLocation);
    setSearchParams({
      q: inputKeyword,
      loc:
        input.hasExplicitLocationCode ||
        activeLocation !== DEFAULT_LOCATION_CODE
          ? activeLocation
          : undefined,
      kLimit: activeResultLimit === 150 ? undefined : activeResultLimit,
      mode: activeMode === "auto" ? undefined : activeMode,
    });

    setSelectedKeyword(null);
    clearSelection();
    setSerpKeyword(null);
    beginSearch(keywords[0], activeLocation);

    runSearch(
      {
        projectId: input.projectId,
        keywords,
        locationCode: activeLocation,
        resultLimit: activeResultLimit,
        mode: activeMode,
      },
      {
        onSuccess: (seedKeyword, nextRows) => {
          if (nextRows.length === 0) {
            setSerpKeyword(null);
            return;
          }
          setSerpKeyword(seedKeyword);
          setSerpPage(0);
        },
      },
    );
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  const toggleSort = (field: SortField) => {
    setSearchParams(getNextSortParams(input.sortField, input.sortDir, field));
  };

  return { onSearch, handleSearchSubmit, toggleSort };
}

export function useSaveAndExportActions(params: SaveExportActionParams) {
  const {
    selectedRows,
    filteredRows,
    input,
    saveKeywordsMutate,
    setShowSaveDialog,
  } = params;

  const handleSaveKeywords = () => {
    if (selectedRows.size === 0) {
      toast.error("Select at least one keyword first");
      return;
    }
    setShowSaveDialog(true);
  };

  const confirmSave = () => {
    saveKeywordsMutate(
      {
        projectId: input.projectId,
        keywords: [...selectedRows],
        locationCode: input.locationCode,
        languageCode: getLanguageCode(input.locationCode),
      },
      {
        onSuccess: () => {
          toast.success(`Saved ${selectedRows.size} keywords`);
          setShowSaveDialog(false);
        },
        onError: (error: unknown) => {
          toast.error(getStandardErrorMessage(error, "Save failed."));
        },
      },
    );
  };

  const exportCsv = () => {
    const source =
      selectedRows.size > 0
        ? filteredRows.filter((row) => selectedRows.has(row.keyword))
        : filteredRows;
    if (source.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = [
      "Keyword",
      "Volume",
      "CPC",
      "Competition",
      "Difficulty",
      "Intent",
    ];
    const csvRows = source.map((row) => [
      row.keyword,
      row.searchVolume ?? "",
      row.cpc?.toFixed(2) ?? "",
      row.competition?.toFixed(2) ?? "",
      row.keywordDifficulty ?? "",
      row.intent,
    ]);
    const csv = buildCsv(headers, csvRows);
    downloadCsv("keyword-research.csv", csv);
  };

  return { handleSaveKeywords, confirmSave, exportCsv };
}
