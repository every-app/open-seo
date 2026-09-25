import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "@/client/components/icons";
import { ExportToSheetsButton } from "@/client/components/table/ExportToSheetsButton";
import type { SerpResultItem } from "@/types/keywords";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
export function SerpAnalysisCard({
  items,
  keyword,
  loading,
  loadingMore,
  canLoadMore,
  error,
  onRetry,
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
  /** The failure was the deeper crawl, so retrying restores the shallow one. */
  deepFetchFailed: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(items.length / pageSize);
  const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <SerpAnalysisLoadingState />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="space-y-2">
          <p>{error}</p>
          {onRetry ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5"
              onClick={onRetry}
            >
              {deepFetchFailed ? "Show top 20" : "Retry"}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (items.length === 0) return <SerpAnalysisEmptyState keyword={keyword} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          {items.length} organic results
        </div>
        <ExportToSheetsButton
          headers={["Rank", "Title", "URL", "Domain"]}
          rows={items.map((item) => [
            item.rank,
            item.title ?? "",
            item.url,
            item.domain,
          ])}
          feature="serp_analysis"
        />
      </div>
      {pageItems.length === 0 && loadingMore ? (
        <SerpAnalysisLoadingState />
      ) : (
        <SerpAnalysisTable items={pageItems} />
      )}
      <SerpAnalysisPagination
        page={page}
        totalPages={totalPages}
        loadingMore={loadingMore}
        canLoadMore={canLoadMore}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function SerpAnalysisTable({ items }: { items: SerpResultItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2">
        <TableHeader>
          <TableRow className="text-xs text-muted-foreground">
            <TableHead className="w-8">#</TableHead>
            <TableHead>Page</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={`${item.rank}-${item.url}`}
              className="hover:bg-muted/50"
            >
              <TableCell className="font-mono text-muted-foreground text-xs">
                {item.rank}
              </TableCell>
              <TableCell className="min-w-0 max-w-0">
                <div className="flex flex-col gap-0.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-link hover:underline truncate flex items-center gap-1"
                    title={item.title}
                  >
                    {item.title || item.url}
                    <ExternalLink className="size-3 shrink-0 opacity-40" />
                  </a>
                  <span className="text-xs text-muted-foreground truncate">
                    {item.domain}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SerpAnalysisPagination({
  page,
  totalPages,
  loadingMore,
  canLoadMore,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  loadingMore: boolean;
  canLoadMore: boolean;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1 && !canLoadMore) return null;

  // Past the loaded results, "Next" stops being free paging and buys a deeper
  // crawl — say so on the button rather than spending silently.
  const nextBuysDeeperSnapshot =
    canLoadMore && !loadingMore && page >= totalPages - 1;

  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {loadingMore ? (
          "Loading more results…"
        ) : (
          <>
            Page {page + 1} of {totalPages}
          </>
        )}
      </span>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5"
          disabled={page === 0 || loadingMore}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5"
          disabled={loadingMore || (page >= totalPages - 1 && !canLoadMore)}
          onClick={() => onPageChange(page + 1)}
        >
          {nextBuysDeeperSnapshot ? "Load top 100" : "Next"}
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SerpAnalysisLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-8"
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </div>
  );
}

function SerpAnalysisEmptyState({ keyword }: { keyword?: string | null }) {
  return (
    <div className="text-sm text-muted-foreground text-center py-8">
      <p>No SERP details available for this keyword yet.</p>
      {keyword ? (
        <p className="mt-1">Try clicking another keyword to load data.</p>
      ) : null}
    </div>
  );
}
