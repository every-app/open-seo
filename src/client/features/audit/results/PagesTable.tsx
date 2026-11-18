import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  extractHostname,
  extractPathname,
  HttpStatusBadge,
} from "@/client/features/audit/shared";
import {
  countActiveFilters,
  PagesFilterBar,
  ResultsTableToolbar,
} from "@/client/features/audit/results/AuditResultsTableFilters";
import {
  EMPTY_PAGES_FILTERS,
  toPagesQuery,
  type PageRow,
  type PagesFilters,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { QueryError } from "@/client/components/QueryState";
import { TablePagination } from "@/client/components/table/TablePagination";
import { useDebouncedDraft } from "@/client/hooks/useDebouncedDraft";
import { getAuditPages } from "@/serverFunctions/audit";
import { auditPagesSortFields } from "@/types/schemas/audit";

const pageColumnHelper = createColumnHelper<PageRow>();

/**
 * Path shown in the URL/redirect cells. Redirect sources on another host
 * (e.g. the apex domain 301ing to www) would otherwise render identically
 * to their target, so include the host whenever it differs from the
 * site's canonical host.
 */
function displayPath(url: string, canonicalHost: string): string {
  const host = extractHostname(url);
  const path = extractPathname(url);
  return host === canonicalHost ? path : host + path;
}

function isRedirect(row: PageRow): boolean {
  return (
    row.statusCode !== null && row.statusCode >= 300 && row.statusCode < 400
  );
}

/** Redirects and blocked/errored fetches have no analyzed content — their
 * zero H1/word/image counts are an artifact, not a finding. */
function hasAnalyzedContent(row: PageRow): boolean {
  return row.fetchClass === "ok" && !isRedirect(row);
}

const EmptyCell = () => (
  <span className="text-xs text-muted-foreground">-</span>
);

function buildPagesColumns(canonicalHost: string): ColumnDef<PageRow>[] {
  return [
    pageColumnHelper.accessor("url", {
      header: ({ column }) => <SortableHeader column={column} label="URL" />,
      cell: ({ getValue }) => {
        const url = getValue();
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <span className="truncate">{displayPath(url, canonicalHost)}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        );
      },
      meta: { cellClassName: "max-w-[240px] truncate" },
    }),
    pageColumnHelper.accessor("statusCode", {
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      // A failed fetch or render has no HTTP status to show.
      cell: ({ getValue, row }) =>
        row.original.fetchClass === "error" ? (
          <Badge
            variant="destructive"
            size="sm"
            title="Fetching or rendering failed, so this page was not checked for content issues."
          >
            Failed
          </Badge>
        ) : (
          <HttpStatusBadge code={getValue()} />
        ),
    }),
    pageColumnHelper.accessor("title", {
      header: ({ column }) => <SortableHeader column={column} label="Title" />,
      cell: ({ getValue, row }) => {
        if (isRedirect(row.original)) {
          const target = row.original.redirectUrl;
          return (
            <span className="text-xs text-muted-foreground">
              → {target ? displayPath(target, canonicalHost) : "redirect"}
            </span>
          );
        }
        const title = getValue();
        if (title) {
          return <span className="break-words">{title}</span>;
        }
        // Red only when the engine flagged it — a 200 that isn't an HTML
        // document (robots.txt, security.txt) legitimately has no title.
        return row.original.missingTitle ? (
          <span className="text-destructive text-xs">missing</span>
        ) : (
          <EmptyCell />
        );
      },
      meta: { cellClassName: "max-w-[360px]" },
    }),
    pageColumnHelper.accessor("h1Count", {
      header: ({ column }) => <SortableHeader column={column} label="H1" />,
      cell: ({ getValue, row }) =>
        hasAnalyzedContent(row.original) ? getValue() : <EmptyCell />,
    }),
    pageColumnHelper.accessor("wordCount", {
      header: ({ column }) => <SortableHeader column={column} label="Words" />,
      cell: ({ getValue, row }) =>
        hasAnalyzedContent(row.original) ? getValue() : <EmptyCell />,
    }),
    pageColumnHelper.display({
      id: "images",
      header: ({ column }) => <SortableHeader column={column} label="Images" />,
      cell: ({ row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        return row.original.imagesMissingAlt > 0 ? (
          <span className="text-warning">
            {row.original.imagesMissingAlt}/{row.original.imagesTotal}
          </span>
        ) : (
          row.original.imagesTotal
        );
      },
      enableSorting: true,
    }),
    pageColumnHelper.accessor("responseTimeMs", {
      header: ({ column }) => <SortableHeader column={column} label="Speed" />,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? (
          <span className="text-xs">{value}ms</span>
        ) : (
          <EmptyCell />
        );
      },
    }),
  ];
}

const PAGE_SIZE = 100;

function sortParams(sorting: SortingState) {
  const [first] = sorting;
  const sort = auditPagesSortFields.find((field) => field === first?.id);
  return { sort: sort ?? "url", order: first?.desc ? "desc" : "asc" } as const;
}

/**
 * Filtering, sorting and paging run in the database: a 10,000-page audit is
 * too big to send to the browser in one response.
 */
export function PagesTable({
  auditRef,
  canonicalHost,
  totalCount,
  tabs,
}: {
  auditRef: { projectId: string; auditId: string };
  canonicalHost: string;
  totalCount: number;
  tabs: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<PagesFilters>(EMPTY_PAGES_FILTERS);
  // The filter bar edits a draft; the query follows it after a pause.
  const [draftFilters, setDraftFilters] = useDebouncedDraft(filters, (next) => {
    setFilters(next);
    setPage(1);
  });
  const [showFilters, setShowFilters] = useState(false);
  // URL order reads as a site inventory; status-first would open the table
  // on its most boring rows (redirects) whenever a site has no errors.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "url", desc: false },
  ]);
  const activeFilterCount = countActiveFilters(
    draftFilters,
    EMPTY_PAGES_FILTERS,
  );
  const pagesQuery = useQuery({
    queryKey: ["audit-pages", auditRef, filters, sorting, page],
    queryFn: () =>
      getAuditPages({
        data: {
          ...auditRef,
          ...toPagesQuery(filters),
          ...sortParams(sorting),
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo(
    () => buildPagesColumns(canonicalHost),
    [canonicalHost],
  );
  const table = useDataTable({
    data: pagesQuery.data?.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(1);
    },
    getRowId: (row) => row.id,
    manualSorting: true,
    // The server sorts by one column, so there is always exactly one sort.
    enableSortingRemoval: false,
    enableMultiSort: false,
  });
  const filteredCount = pagesQuery.data?.totalCount ?? 0;

  const resetFilters = () => setDraftFilters(EMPTY_PAGES_FILTERS);

  return (
    <DataTable
      table={table}
      isLoading={pagesQuery.isPending}
      isRefreshing={pagesQuery.isPlaceholderData}
      error={
        pagesQuery.isError ? (
          <QueryError
            fallback="Could not load the pages"
            onRetry={() => void pagesQuery.refetch()}
            isRetrying={pagesQuery.isFetching}
          />
        ) : undefined
      }
      empty={{ title: "No pages crawled" }}
      isFiltered={activeFilterCount > 0}
      onClearFilters={resetFilters}
      toolbar={
        <>
          {tabs}
          <ResultsTableToolbar
            showFilters={showFilters}
            onToggle={() => setShowFilters((current) => !current)}
            activeFilterCount={activeFilterCount}
            resultCount={filteredCount}
            totalCount={totalCount}
          />
          {showFilters ? (
            <PagesFilterBar
              filters={draftFilters}
              onChange={setDraftFilters}
              activeFilterCount={activeFilterCount}
              onReset={resetFilters}
            />
          ) : null}
        </>
      }
      footer={
        filteredCount > PAGE_SIZE ? (
          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={filteredCount}
            isLoading={pagesQuery.isFetching}
            onPageChange={setPage}
          />
        ) : undefined
      }
    />
  );
}
