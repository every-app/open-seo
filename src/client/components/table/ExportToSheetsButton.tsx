import { Sheet } from "lucide-react";
import { useState } from "react";
import type { CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";

type Props = {
  headers: string[];
  /**
   * Full filtered/sorted dataset (not a UI-paginated slice). Emit raw numeric
   * values (not formatted strings) so Sheets parses them as numbers.
   */
  rows: CsvValue[][];
  /** PostHog `source_feature` for the `data:export_sheets` event. */
  feature: string;
  disabled?: boolean;
  label?: string;
  /** Render the icon without a text label (icon-only mode for tight rows). */
  iconOnly?: boolean;
  /** Extra classes appended to the default button classes. */
  className?: string;
};

export function ExportToSheetsButton({
  headers,
  rows,
  feature,
  disabled,
  label = "导出到 Google 表格",
  iconOnly,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportTableToSheets({ headers, rows, feature });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-xs gap-1 ${className ?? ""}`}
      onClick={handleClick}
      disabled={disabled || rows.length === 0 || busy}
      title="复制表格并打开新的 Google 表格"
      aria-label={iconOnly ? "导出到 Google 表格" : undefined}
    >
      <Sheet className="size-3.5" />
      {iconOnly ? null : label}
    </button>
  );
}
