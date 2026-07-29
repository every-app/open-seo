import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import {
  exportPagespeedRows,
  type PagespeedExportUrl,
} from "@/client/features/pagespeed/export";
import type { SnapshotWithPrevious } from "@/shared/pagespeed";

export function PagespeedExportMenu({
  urls,
  latest,
  strategy,
}: {
  urls: readonly PagespeedExportUrl[];
  latest: Map<string, SnapshotWithPrevious>;
  strategy: string;
}) {
  if (urls.length === 0) return null;
  return (
    <TableExportMenu
      buttonClassName="btn btn-ghost btn-sm gap-1"
      actions={[
        {
          label: "Export to Sheets",
          onClick: () => exportPagespeedRows(urls, latest, strategy, "sheets"),
        },
        {
          label: "Download CSV",
          onClick: () => exportPagespeedRows(urls, latest, strategy, "csv"),
        },
      ]}
    />
  );
}
