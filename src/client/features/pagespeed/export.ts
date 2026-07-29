import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import type { SnapshotWithPrevious } from "@/shared/pagespeed";

export type PagespeedExportUrl = {
  id: string;
  url: string;
  isHomepage: boolean;
  scheduleEnabled: boolean;
};

const HEADERS = [
  "URL",
  "Homepage",
  "Daily run",
  "Strategy",
  "Performance",
  "Accessibility",
  "Best practices",
  "SEO",
  "Lab LCP (ms)",
  "Lab CLS",
  "Lab TBT (ms)",
  "Lab FCP (ms)",
  "Lab Speed Index (ms)",
  "Lab TTFB (ms)",
  "Field LCP (ms)",
  "Field INP (ms)",
  "Field CLS",
  "Field verdict",
  "Field source",
  "Last run",
  "Error",
];

/**
 * The monitored-URL table for one strategy, as export rows.
 *
 * Exports raw numbers rather than the page's formatted strings so the result
 * is usable in a spreadsheet. Every monitored URL gets a row, including ones
 * that have never run — "no data yet" is itself worth reporting. Field columns
 * carry the source so an origin-wide value is never mistaken for the page's
 * own, matching how the table labels it.
 */
export function buildPagespeedExportTable(
  urls: readonly PagespeedExportUrl[],
  latest: Map<string, SnapshotWithPrevious>,
  strategy: string,
): { headers: string[]; rows: CsvValue[][] } {
  const rows: CsvValue[][] = urls.map((url) => {
    const snapshot = latest.get(url.id)?.snapshot;
    return [
      url.url,
      url.isHomepage ? "yes" : "no",
      url.scheduleEnabled ? "yes" : "paused",
      strategy,
      snapshot?.performanceScore ?? null,
      snapshot?.accessibilityScore ?? null,
      snapshot?.bestPracticesScore ?? null,
      snapshot?.seoScore ?? null,
      snapshot?.lcpMs ?? null,
      snapshot?.cls ?? null,
      snapshot?.tbtMs ?? null,
      snapshot?.fcpMs ?? null,
      snapshot?.speedIndexMs ?? null,
      snapshot?.ttfbMs ?? null,
      snapshot?.fieldLcpMs ?? null,
      snapshot?.fieldInpMs ?? null,
      snapshot?.fieldCls ?? null,
      snapshot?.fieldOverallCategory ?? null,
      snapshot?.fieldSource ?? null,
      snapshot?.createdAt ?? null,
      snapshot?.errorMessage ?? null,
    ];
  });
  return { headers: HEADERS, rows };
}

/** Export the full monitored-URL set (all rows are client-side already, so
 *  nothing is truncated), mirroring the Bing and Search Console exports. */
export function exportPagespeedRows(
  urls: readonly PagespeedExportUrl[],
  latest: Map<string, SnapshotWithPrevious>,
  strategy: string,
  target: "csv" | "sheets",
): void {
  const { headers, rows } = buildPagespeedExportTable(urls, latest, strategy);
  if (target === "csv") {
    downloadCsv(`pagespeed-${strategy}-latest.csv`, buildCsv(headers, rows));
    captureClientEvent("data:export", {
      source_feature: "pagespeed",
      result_count: rows.length,
    });
    return;
  }
  void exportTableToSheets({ headers, rows, feature: "pagespeed" });
}
