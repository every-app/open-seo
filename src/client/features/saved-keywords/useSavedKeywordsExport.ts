import { useMemo, useState } from "react";
import { toast } from "sonner";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
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
  const [exportingSelection, setExportingSelection] = useState<
    "csv" | "sheets" | null
  >(null);

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

  const loadFilteredRows = async () => {
    const result = await exportSavedKeywords({ data: exportInput });
    return result.rows;
  };

  const exportFilteredCsv = async () => {
    setExporting("csv");
    try {
      const rows = await loadFilteredRows();
      if (rows.length === 0) {
        toast.error("没有可导出的关键词");
        return;
      }
      downloadKeywordCsv(rows);
      captureClientEvent("data:export", {
        source_feature: "saved_keywords",
        result_count: rows.length,
      });
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "无法导出 CSV"));
    } finally {
      setExporting(null);
    }
  };

  const exportFilteredSheets = async () => {
    setExporting("sheets");
    try {
      const rows = await loadFilteredRows();
      await exportTableToSheets({
        headers: SAVED_KEYWORD_EXPORT_HEADERS,
        rows: rows.map(savedKeywordExportRow),
        feature: "saved_keywords",
      });
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "无法导出到 Google 表格"));
    } finally {
      setExporting(null);
    }
  };

  const exportSelectionCsv = (selectedRows: SavedKeywordRow[]) => {
    if (selectedRows.length === 0) return;
    setExportingSelection("csv");
    try {
      downloadKeywordCsv(selectedRows);
      captureClientEvent("data:export", {
        source_feature: "saved_keywords",
        result_count: selectedRows.length,
        scope: "selection",
      });
    } finally {
      setExportingSelection(null);
    }
  };

  const exportSelectionSheets = async (selectedRows: SavedKeywordRow[]) => {
    if (selectedRows.length === 0) return;
    setExportingSelection("sheets");
    try {
      await exportTableToSheets({
        headers: SAVED_KEYWORD_EXPORT_HEADERS,
        rows: selectedRows.map(savedKeywordExportRow),
        feature: "saved_keywords",
      });
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "无法导出到 Google 表格"));
    } finally {
      setExportingSelection(null);
    }
  };

  return {
    exporting,
    exportingSelection,
    exportFilteredCsv,
    exportFilteredSheets,
    exportSelectionCsv,
    exportSelectionSheets,
  };
}

function downloadKeywordCsv(rows: SavedKeywordRow[]) {
  const csvRows = rows
    .map(savedKeywordExportRow)
    .map((row) =>
      row.map((cell, index) =>
        (index === 2 || index === 3) && typeof cell === "number"
          ? cell.toFixed(2)
          : cell,
      ),
    );
  downloadCsv(
    "saved-keywords.csv",
    buildCsv(SAVED_KEYWORD_EXPORT_HEADERS, csvRows),
  );
}
