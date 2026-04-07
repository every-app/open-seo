import { toast } from "sonner";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { getLanguageCode } from "@/client/features/keywords/utils";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";

type SaveExportActionParams = {
  selectedRows: Set<string>;
  rows: KeywordResearchRow[];
  filteredRows: KeywordResearchRow[];
  input: KeywordResearchControllerInput;
  saveKeywordsMutate: (
    variables: SaveKeywordsInput,
    options: {
      onSuccess: () => void;
      onError: (error: unknown) => void;
    },
  ) => void;
  setShowSaveDialog: (show: boolean) => void;
};

export function parseKeywordInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function getNextSortParams(
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

export function useSaveAndExportActions(params: SaveExportActionParams) {
  const {
    selectedRows,
    rows,
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
    const metrics = rows
      .filter((row) => selectedRows.has(row.keyword))
      .map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        monthlySearches: row.trend,
      }));

    saveKeywordsMutate(
      {
        projectId: input.projectId,
        keywords: [...selectedRows],
        locationCode: input.locationCode,
        languageCode: getLanguageCode(input.locationCode),
        metrics,
      },
      {
        onSuccess: () => {
          captureClientEvent("keyword:save", {
            source_feature: "keyword_research",
            keyword_count: selectedRows.size,
          });
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
    captureClientEvent("data:export", {
      source_feature: "keyword_research",
      result_count: source.length,
    });
  };

  return { handleSaveKeywords, confirmSave, exportCsv };
}
