import { toast } from "sonner";
import { buildCsv, type CsvValue } from "@/client/lib/csv";
import { downloadFile } from "@/client/lib/download";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";

export type ExportFormat = "csv" | "excel" | "json" | "copy-json" | "sheets";

/**
 * One entry point for every table export, so each format shares the empty
 * check and the analytics event.
 */
export async function exportRows(args: {
  format: ExportFormat;
  /** PostHog `source_feature`. */
  feature: string;
  headers: string[];
  rows: CsvValue[][];
  /** File name without the extension. */
  filename: string;
  /** Records for the JSON formats. Defaults to `rows` keyed by `headers`. */
  records?: unknown[];
  /** Set when the export is the user's row selection. */
  scope?: "selection";
}): Promise<void> {
  const { format, feature, headers, rows, filename, scope } = args;
  if (rows.length === 0) {
    toast.error("No data to export");
    return;
  }

  // Sheets fires its own `data:export_sheets` event.
  if (format === "sheets") {
    await exportTableToSheets({ headers, rows, feature });
    return;
  }

  const records =
    args.records ??
    rows.map((row) =>
      Object.fromEntries(headers.map((header, i) => [header, row[i]])),
    );

  if (format === "copy-json") {
    try {
      await navigator.clipboard.writeText(JSON.stringify(records, null, 2));
      toast.success("Copied data");
    } catch {
      toast.error("Could not copy to clipboard");
      return;
    }
  } else if (format === "json") {
    downloadFile(
      JSON.stringify(records, null, 2),
      `${filename}.json`,
      "application/json",
    );
  } else {
    // "Excel" is the same CSV with an .xls extension, which Excel opens.
    downloadFile(
      buildCsv(headers, rows),
      `${filename}.${format === "excel" ? "xls" : "csv"}`,
      "text/csv",
    );
  }

  captureClientEvent("data:export", {
    source_feature: feature,
    format,
    result_count: rows.length,
    scope,
  });
}
