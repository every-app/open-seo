import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink, Globe } from "lucide-react";
import { ErrorState } from "@/client/components/ErrorState";
import { ExportMenu } from "@/client/components/ExportMenu";
import { Button } from "@/client/components/ui/button";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { DataTableToolbar } from "@/client/components/table/DataTableToolbar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { exportRows } from "@/client/lib/exportRows";
import type { SerpResultItem } from "@/types/keywords";
import { safeHttpUrl } from "@/shared/safe-url";

const columnHelper = createColumnHelper<SerpResultItem>();

const columns = [
  columnHelper.accessor("rank", {
    header: "#",
    cell: ({ getValue }) => getValue(),
    meta: {
      headerClassName: "w-8",
      cellClassName: "font-mono text-xs text-muted-foreground",
    },
  }),
  columnHelper.display({
    id: "page",
    header: "Page",
    cell: ({ row }) => {
      const label = row.original.title || row.original.url;
      // Provider URLs are untrusted: only http(s) links become clickable.
      const safeUrl = safeHttpUrl(row.original.url);
      return (
        <div className="flex flex-col gap-0.5">
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-medium text-primary hover:underline"
              title={row.original.title}
            >
              <span className="truncate">{label}</span>
              <ExternalLink className="size-3 shrink-0 opacity-40" />
            </a>
          ) : (
            <span className="truncate font-medium">{label}</span>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {row.original.domain}
          </span>
        </div>
      );
    },
    meta: { cellClassName: "min-w-0 max-w-0" },
  }),
];

export function SerpAnalysisCard({
  items,
  keyword,
  loading,
  loadingMore,
  canLoadMore,
  error,
  onRetry,
  retrying,
  deepFetchFailed,
  page,
  pageSize,
  onPageChange,
}: {
  items: SerpResultItem[];
  keyword?: string | null;
  loading: boolean;
  /** A deeper snapshot is being fetched; `items` is still the shallow one. */
  loadingMore: boolean;
  /** Paging past the loaded results can buy a deeper snapshot. */
  canLoadMore: boolean;
  error?: string | null;
  onRetry?: () => void;
  retrying: boolean;
  /** The failure was the deeper crawl, so retrying restores the shallow one. */
  deepFetchFailed: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(items.length / pageSize);
  const pageItems = useMemo(
    () => items.slice(page * pageSize, (page + 1) * pageSize),
    [items, page, pageSize],
  );
  const table = useDataTable({ data: pageItems, columns });
  const hasItems = !loading && items.length > 0;

  const retryButton = onRetry ? (
    <Button variant="outline" size="sm" pending={retrying} onClick={onRetry}>
      {deepFetchFailed ? "Show top 20" : "Retry"}
    </Button>
  ) : null;

  return (
    <DataTable
      table={table}
      isLoading={loading || (pageItems.length === 0 && loadingMore)}
      toolbar={
        <>
          <DataTableToolbar
            actions={
              hasItems ? (
                <ExportMenu
                  actions={["sheets", "csv"]}
                  onExport={(format) =>
                    void exportRows({
                      format,
                      feature: "serp_analysis",
                      headers: ["Rank", "Title", "URL", "Domain"],
                      rows: items.map((item) => [
                        item.rank,
                        item.title ?? "",
                        item.url,
                        item.domain,
                      ]),
                      filename: "serp-analysis",
                    })
                  }
                />
              ) : null
            }
          >
            <div className="flex min-w-0 flex-col">
              <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                <Globe className="size-3.5 shrink-0" />
                SERP Analysis
                {keyword ? (
                  <span className="truncate font-normal text-muted-foreground">
                    : {keyword}
                  </span>
                ) : null}
              </h3>
              {hasItems ? (
                <span className="text-xs text-muted-foreground">
                  {items.length} organic results
                </span>
              ) : null}
            </div>
          </DataTableToolbar>
          {error && hasItems ? (
            <div className="border-b border-border px-4 py-3">
              <ErrorState
                variant="inline"
                message={error}
                action={retryButton}
              />
            </div>
          ) : null}
        </>
      }
      empty={
        error
          ? { kind: "error", title: error, action: retryButton }
          : {
              title: "No SERP details available for this keyword yet.",
              description: keyword
                ? "Try clicking another keyword to load data."
                : undefined,
            }
      }
      footer={
        hasItems && (totalPages > 1 || canLoadMore) ? (
          <TablePagination
            page={page + 1}
            pageSize={pageSize}
            totalCount={items.length}
            isLoading={loadingMore}
            // Past the loaded results, "Next" buys a deeper crawl. The button
            // says so rather than spending silently.
            loadMoreLabel={canLoadMore ? "Load top 100" : undefined}
            onPageChange={(nextPage) => onPageChange(nextPage - 1)}
          />
        ) : null
      }
    />
  );
}
