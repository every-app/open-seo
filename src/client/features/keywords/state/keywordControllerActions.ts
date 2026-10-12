import { useMemo } from "react";
import { toast } from "sonner";
import type { CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";
import { captureClientEvent } from "@/client/lib/posthog";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";
import type { KeywordResearchDisplayRow } from "@/client/features/keywords/groupSharedVolumeRows";
import { formatLocationLabel } from "@/shared/keyword-locations";

/** Local exports name the area the volume, CPC, and competition cover. */
function keywordResearchHeaders(locationName?: string) {
  const scope = locationName ? ` (${formatLocationLabel(locationName)})` : "";
  return [
    "Keyword",
    `Volume${scope}`,
    `CPC${scope}`,
    `Competition${scope}`,
    "Score",
    "Intent",
  ];
}

export const KEYWORD_RESEARCH_HEADERS = keywordResearchHeaders();

function keywordResearchExportRow(row: KeywordResearchRow): CsvValue[] {
  return [
    row.keyword,
    row.searchVolume ?? "",
    row.cpc ?? "",
    row.competition ?? "",
    row.keywordDifficulty ?? "",
    row.intent,
  ];
}

type SaveExportActionParams = {
  selectedRows: Set<string>;
  filteredRows: KeywordResearchDisplayRow[];
  input: KeywordResearchControllerInput;
  saveKeywordsMutate: (
    variables: SaveKeywordsInput,
    options: { onSuccess: () => void },
  ) => void;
  setShowSaveDialog: (show: boolean) => void;
};

export function parseKeywordInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

/**
 * Stable identity for a keyword-research request. Used to dedup the
 * URL-driven search trigger against the form-submit path so the same
 * params don't fire two requests back-to-back.
 */
export function buildKeywordSearchKey(params: {
  keyword: string;
  locationCode: number | undefined;
  locationName: string | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  groupKeywords: boolean;
}) {
  return [
    parseKeywordInput(params.keyword).join(""),
    params.locationCode,
    params.locationName,
    params.resultLimit,
    params.mode,
    params.clickstream ? "cs" : "",
    params.groupKeywords ? "grouped" : "",
  ].join("|");
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
    filteredRows,
    input,
    saveKeywordsMutate,
    setShowSaveDialog,
  } = params;

  // Save and export act on the same rows: the selected rows that the current
  // filters show.
  const selectedKeywordRows = useMemo(
    () => filteredRows.filter((row) => selectedRows.has(row.keyword)),
    [filteredRows, selectedRows],
  );

  const handleSaveKeywords = () => {
    setShowSaveDialog(true);
  };

  const confirmSave = () => {
    const count = selectedKeywordRows.length;
    // Saved keyword metrics are stored per country, so local numbers are not
    // saved. The saved list keeps the national metrics.
    const metrics = input.locationName
      ? undefined
      : selectedKeywordRows.map((row) => ({
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
        keywords: selectedKeywordRows.map((row) => row.keyword),
        locationCode: input.locationCode,
        metrics,
      },
      {
        onSuccess: () => {
          captureClientEvent("keyword:save", {
            source_feature: "keyword_research",
            keyword_count: count,
          });
          toast.success(`Saved ${count} keywords`);
          setShowSaveDialog(false);
        },
      },
    );
  };

  const exportKeywords = (
    format: "csv" | "sheets",
    exportedRows: KeywordResearchRow[],
    scope?: "selection",
  ) => {
    const tableRows = exportedRows.map(keywordResearchExportRow);
    void exportRows({
      format,
      feature: "keyword_research",
      headers: keywordResearchHeaders(input.locationName),
      rows: format === "csv" ? formatCentsForCsv(tableRows) : tableRows,
      filename: "keyword-research",
      scope,
    });
  };

  return {
    handleSaveKeywords,
    confirmSave,
    selectedKeywordRows,
    exportAll: (format: "csv" | "sheets") =>
      exportKeywords(format, filteredRows),
    exportSelection: (format: "csv" | "sheets") =>
      exportKeywords(format, selectedKeywordRows, "selection"),
  };
}

/**
 * CSV downloads show CPC and competition (columns 3 and 4 of the keyword
 * headers) with two decimals. Sheets keeps raw numbers.
 */
export function formatCentsForCsv(rows: CsvValue[][]): CsvValue[][] {
  return rows.map((row) =>
    row.map((cell, idx) =>
      (idx === 2 || idx === 3) && typeof cell === "number"
        ? cell.toFixed(2)
        : cell,
    ),
  );
}
