import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";

type BingExportRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

/** Export the FULL row set (all rows are client-side already, so pagination
 *  never truncates a download), mirroring the Search Console exports. Bing
 *  has no date range, so filenames say whole-window instead of a stamp. */
function exportBingRows(
  label: string,
  keyHeader: string,
  rows: BingExportRow[],
  target: "csv" | "sheets",
): void {
  const headers = [keyHeader, "Clicks", "Impressions", "CTR", "Position"];
  const exportRows: CsvValue[][] = rows.map((row) => [
    row.key,
    row.clicks,
    row.impressions,
    row.ctr,
    row.position,
  ]);
  if (target === "csv") {
    downloadCsv(
      `bing-${label}-whole-window.csv`,
      buildCsv(headers, exportRows),
    );
    captureClientEvent("data:export", {
      source_feature: "bing_performance",
      result_count: rows.length,
    });
    return;
  }
  void exportTableToSheets({
    headers,
    rows: exportRows,
    feature: "bing_performance",
  });
}

export function BingExportMenu({
  label,
  keyHeader,
  rows,
}: {
  label: string;
  keyHeader: string;
  rows: BingExportRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <TableExportMenu
      buttonClassName="btn btn-ghost btn-sm gap-1"
      actions={[
        {
          label: "Export to Sheets",
          onClick: () => exportBingRows(label, keyHeader, rows, "sheets"),
        },
        {
          label: "Download CSV",
          onClick: () => exportBingRows(label, keyHeader, rows, "csv"),
        },
      ]}
    />
  );
}
