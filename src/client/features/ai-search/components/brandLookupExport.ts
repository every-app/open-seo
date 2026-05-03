import { buildCsv, type CsvValue, downloadCsv } from "@/client/lib/csv";
import { formatPlatformLabel } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type CitationTab = "queries" | "pages";

type PageRow = BrandLookupResult["topPages"][number];
type QueryRow = BrandLookupResult["topQueries"][number];

export function buildBrandLookupExport(
  tab: CitationTab,
  sortedPages: PageRow[],
  sortedQueries: QueryRow[],
): { headers: string[]; rows: CsvValue[][] } {
  if (tab === "pages") {
    return {
      headers: ["URL", "Domain", "Platform", "Mentions"],
      rows: sortedPages.map((row) => [
        row.url,
        row.domain ?? "",
        formatPlatformLabel(row.platform),
        row.mentions ?? "",
      ]),
    };
  }
  return {
    headers: [
      "Query",
      "Platform",
      "AI search volume",
      "First seen",
      "Last seen",
    ],
    rows: sortedQueries.map((row) => [
      row.question,
      formatPlatformLabel(row.platform),
      row.aiSearchVolume ?? "",
      row.firstSeenAt ?? "",
      row.lastSeenAt ?? "",
    ]),
  };
}

export function downloadBrandLookupCsv(
  tab: CitationTab,
  resolvedTarget: string,
  table: { headers: string[]; rows: CsvValue[][] },
) {
  const slug = slugify(resolvedTarget);
  const filename =
    tab === "pages"
      ? `ai-brand-lookup-pages-${slug}.csv`
      : `ai-brand-lookup-queries-${slug}.csv`;
  downloadCsv(filename, buildCsv(table.headers, table.rows));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
