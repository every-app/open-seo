import { type Dispatch, type SetStateAction } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Save,
  Search,
  Sheet,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { DomainFilterPanel } from "@/client/features/domain/components/DomainFilterPanel";
import { DomainKeywordsPagination } from "@/client/features/domain/components/DomainKeywordsPagination";
import { DomainKeywordsTable } from "@/client/features/domain/components/DomainKeywordsTable";
import { DomainPagesTable } from "@/client/features/domain/components/DomainPagesTable";
import type { useDomainFilters } from "@/client/features/domain/hooks/useDomainFilters";
import {
  getDefaultSortOrder,
  keywordsToTable,
  pagesToTable,
} from "@/client/features/domain/utils";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import type {
  DomainActiveTab,
  DomainOverviewData,
  DomainSortMode,
  KeywordRow,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  projectId: string;
  overview: DomainOverviewData;
  activeTab: DomainActiveTab;
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  searchDraft: string;
  selectedKeywords: Set<string>;
  visibleKeywords: string[];
  filteredKeywords: KeywordRow[];
  pagedPages: PageRow[];
  showFilters: boolean;
  setShowFilters: Dispatch<SetStateAction<boolean>>;
  filtersForm: ReturnType<typeof useDomainFilters>["filtersForm"];
  activeFilterCount: number;
  dirtyFilterCount: number;
  conditionCount: number;
  overLimit: boolean;
  resetFilters: () => void;
  applyFilters: () => void;
  cancelFilterEdits: () => void;
  onSearchChange: (value: string) => void;
  onSaveKeywords: () => void;
  canSaveKeywords: boolean;
  onSortClick: (sort: DomainSortMode) => void;
  onToggleKeyword: (keyword: string) => void;
  page: number;
  pageSize: number;
  totalKeywordCount: number | null;
  totalPagesCount: number | null;
  hasNextKeywordsPage: boolean;
  hasNextPagesPage: boolean;
  isKeywordsLoading: boolean;
  isPagesLoading: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
};

const KEYWORDS_ONLY_SORTS: ReadonlySet<DomainSortMode> = new Set([
  "rank",
  "score",
  "cpc",
]);

export function DomainResultsCard({
  projectId,
  overview,
  activeTab,
  sortMode,
  currentSortOrder,
  searchDraft,
  selectedKeywords,
  visibleKeywords,
  filteredKeywords,
  pagedPages,
  showFilters,
  setShowFilters,
  filtersForm,
  activeFilterCount,
  dirtyFilterCount,
  conditionCount,
  overLimit,
  resetFilters,
  applyFilters,
  cancelFilterEdits,
  onSearchChange,
  onSaveKeywords,
  canSaveKeywords,
  onSortClick,
  onToggleKeyword,
  page,
  pageSize,
  totalKeywordCount,
  totalPagesCount,
  hasNextKeywordsPage,
  hasNextPagesPage,
  isKeywordsLoading,
  isPagesLoading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const isKeywordsTab = activeTab === "keywords";
  const currentRows = isKeywordsTab ? filteredKeywords : pagedPages;
  const exportTable = isKeywordsTab
    ? keywordsToTable(filteredKeywords)
    : pagesToTable(pagedPages);

  const handleCopy = async () => {
    const text = JSON.stringify(currentRows, null, 2);
    await navigator.clipboard.writeText(text);
    toast.success("Copied data");
  };

  const handleExportToSheets = () => {
    void exportTableToSheets({
      headers: exportTable.headers,
      rows: exportTable.rows,
      feature: "domain_overview",
    });
  };

  const handleDownload = (extension: "csv" | "xls") => {
    downloadCsv(
      `${overview.domain}-${activeTab}.${extension}`,
      buildCsv(exportTable.headers, exportTable.rows),
    );

    if (extension === "csv") {
      captureClientEvent("data:export", {
        source_feature: "domain_overview",
        result_count: currentRows.length,
      });
    }
  };

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
        <div role="tablist" className="tabs tabs-box w-fit">
          <Link
            from="/p/$projectId/domain"
            to="/p/$projectId/domain"
            params={{ projectId }}
            search={(prev) => ({ ...prev, tab: undefined, page: undefined })}
            replace
            role="tab"
            className={`tab ${activeTab === "keywords" ? "tab-active" : ""}`}
          >
            Top Keywords
          </Link>
          <Link
            from="/p/$projectId/domain"
            to="/p/$projectId/domain"
            params={{ projectId }}
            search={(prev) => {
              const fallbackSortNeeded = KEYWORDS_ONLY_SORTS.has(sortMode);
              const nextSort = fallbackSortNeeded ? "traffic" : prev.sort;
              const nextOrder = fallbackSortNeeded
                ? getDefaultSortOrder("traffic")
                : prev.order;
              return {
                ...prev,
                tab: "pages" as const,
                sort: nextSort,
                order: nextOrder,
                page: undefined,
              };
            }}
            replace
            role="tab"
            className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
          >
            Top Pages
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "keywords" ? (
            <button
              className="btn btn-sm"
              onClick={onSaveKeywords}
              disabled={selectedKeywords.size === 0 || !canSaveKeywords}
              title={
                !canSaveKeywords && selectedKeywords.size > 0
                  ? "Re-run search to save keywords for the selected location"
                  : undefined
              }
            >
              <Save className="size-4" /> Save Keywords
            </button>
          ) : null}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-sm gap-1">
              <Download className="size-4" />
              Export
              <ChevronDown className="size-3 opacity-60" />
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-56"
            >
              <li>
                <button onClick={handleExportToSheets}>
                  <Sheet className="size-4" />
                  Export to Sheets
                </button>
              </li>
              <li>
                <button onClick={handleCopy}>
                  <Copy className="size-4" />
                  Copy data (JSON)
                </button>
              </li>
              <li>
                <button onClick={() => handleDownload("csv")}>
                  <Download className="size-4" />
                  Download CSV
                </button>
              </li>
              <li>
                <button onClick={() => handleDownload("xls")}>
                  <FileSpreadsheet className="size-4" />
                  Download Excel
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
        {isKeywordsTab ? (
          <button
            className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
            title="Toggle filters"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="badge badge-xs badge-primary border-0 text-primary-content">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <span className="text-sm text-base-content/60">
          {isKeywordsTab
            ? totalKeywordCount != null
              ? `${totalKeywordCount.toLocaleString()} keywords`
              : `${filteredKeywords.length.toLocaleString()} keywords`
            : totalPagesCount != null
              ? `${totalPagesCount.toLocaleString()} pages`
              : `${pagedPages.length.toLocaleString()} pages`}
        </span>
        <div className="flex-1" />
        <form
          className="w-full max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            if (!overLimit) applyFilters();
          }}
        >
          <label className="input input-bordered input-sm w-full flex items-center gap-2">
            <Search className="size-4 text-base-content/60" />
            <input
              placeholder="Search in results (press Enter)"
              value={searchDraft}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </form>
      </div>

      {isKeywordsTab && showFilters ? (
        <DomainFilterPanel
          filtersForm={filtersForm}
          activeFilterCount={activeFilterCount}
          dirtyFilterCount={dirtyFilterCount}
          conditionCount={conditionCount}
          overLimit={overLimit}
          resetFilters={resetFilters}
          applyFilters={applyFilters}
          cancelFilterEdits={cancelFilterEdits}
        />
      ) : null}

      <div className="p-4">
        {isKeywordsTab ? (
          <div
            className={
              isKeywordsLoading
                ? "opacity-60 transition-opacity"
                : "transition-opacity"
            }
          >
            <DomainKeywordsTable
              domain={overview.domain}
              rows={filteredKeywords}
              selectedKeywords={selectedKeywords}
              visibleKeywords={visibleKeywords}
              sortMode={sortMode}
              currentSortOrder={currentSortOrder}
              onSortClick={onSortClick}
              onToggleKeyword={onToggleKeyword}
            />
          </div>
        ) : (
          <div
            className={
              isPagesLoading
                ? "opacity-60 transition-opacity"
                : "transition-opacity"
            }
          >
            <DomainPagesTable
              domain={overview.domain}
              rows={pagedPages}
              sortMode={sortMode}
              currentSortOrder={currentSortOrder}
              onSortClick={onSortClick}
            />
          </div>
        )}
      </div>

      <DomainKeywordsPagination
        page={page}
        pageSize={pageSize}
        totalCount={isKeywordsTab ? totalKeywordCount : totalPagesCount}
        hasNextPage={isKeywordsTab ? hasNextKeywordsPage : hasNextPagesPage}
        isLoading={isKeywordsTab ? isKeywordsLoading : isPagesLoading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
