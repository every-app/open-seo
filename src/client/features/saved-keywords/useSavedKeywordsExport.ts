import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCentsForCsv } from "@/client/features/keywords/state/keywordControllerActions";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { exportRows } from "@/client/lib/exportRows";
import { exportSavedKeywords } from "@/serverFunctions/keywords";
import type { SavedKeywordRow } from "@/types/keywords";
import type { ExportSavedKeywordsInput } from "@/types/schemas/keywords";
import type { AppliedSavedKeywordsFilters } from "./savedKeywordsFilterTypes";
import {
  SAVED_KEYWORD_EXPORT_HEADERS,
  savedKeywordExportRow,
} from "./savedKeywordsUtils";

export function useSavedKeywordsExport(params: {
  projectId: string;
  appliedFilters: AppliedSavedKeywordsFilters;
  selectedTagIds: string[];
  sort: ExportSavedKeywordsInput["sort"];
  order: ExportSavedKeywordsInput["order"];
}) {
  const [exporting, setExporting] = useState<"csv" | "sheets" | null>(null);
  const [exportingSelection, setExportingSelection] = useState(false);

  const exportInput = useMemo<ExportSavedKeywordsInput>(
    () => ({
      projectId: params.projectId,
      ...params.appliedFilters,
      tagIds:
        params.selectedTagIds.length > 0 ? params.selectedTagIds : undefined,
      sort: params.sort,
      order: params.order,
    }),
    [
      params.appliedFilters,
      params.order,
      params.projectId,
      params.selectedTagIds,
      params.sort,
    ],
  );

  const runExport = async (
    format: "csv" | "sheets",
    rows: SavedKeywordRow[],
    scope?: "selection",
  ) => {
    const tableRows = rows.map(savedKeywordExportRow);
    await exportRows({
      format,
      feature: "saved_keywords",
      headers: SAVED_KEYWORD_EXPORT_HEADERS,
      rows: format === "csv" ? formatCentsForCsv(tableRows) : tableRows,
      filename: "saved-keywords",
      scope,
    });
  };

  const exportFiltered = async (format: "csv" | "sheets") => {
    setExporting(format);
    try {
      const result = await exportSavedKeywords({ data: exportInput });
      await runExport(format, result.rows);
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Could not export"));
    } finally {
      setExporting(null);
    }
  };

  const exportSelection = async (
    format: "csv" | "sheets",
    selectedRows: SavedKeywordRow[],
  ) => {
    setExportingSelection(true);
    try {
      await runExport(format, selectedRows, "selection");
    } finally {
      setExportingSelection(false);
    }
  };

  return {
    exporting,
    exportingSelection,
    exportFiltered,
    exportSelection,
  };
}
