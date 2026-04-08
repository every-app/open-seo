import { type Dispatch, type SetStateAction } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Save,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { DomainFilterPanel } from "@/client/features/domain/components/DomainFilterPanel";
import { DomainKeywordsTable } from "@/client/features/domain/components/DomainKeywordsTable";
import { DomainPagesTable } from "@/client/features/domain/components/DomainPagesTable";
import type { useDomainFilters } from "@/client/features/domain/hooks/useDomainFilters";
import {
  downloadCsv,
  keywordsToCsv,
  pagesToCsv,
} from "@/client/features/domain/utils";
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
  overview: DomainOverviewData;
  activeTab: DomainActiveTab;
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  pendingSearch: string;
  selectedKeywords: Set<string>;
  visibleKeywords: string[];
  filteredKeywords: KeywordRow[];
  filteredPages: PageRow[];
  showFilters: boolean;
  setShowFilters: Dispatch<SetStateAction<boolean>>;
  filtersForm: ReturnType<typeof useDomainFilters>["filtersForm"];
  activeFilterCount: number;
  resetFilters: () => void;
  onTabChange: (tab: DomainActiveTab) => void;
  onSearchChange: (value: string) => void;
  onSaveKeywords: () => void;
  onSortClick: (sort: DomainSortMode) => void;
  onToggleKeyword: (keyword: string) => void;
  onToggleAllVisible: () => void;
};

export function DomainResultsCard({
  overview,
  activeTab,
  sortMode,
  currentSortOrder,
  pendingSearch,
  selectedKeywords,
  visibleKeywords,
  filteredKeywords,
  filteredPages,
  showFilters,
  setShowFilters,
  filtersForm,
  activeFilterCount,
  resetFilters,
  onTabChange,
  onSearchChange,
  onSaveKeywords,
  onSortClick,
  onToggleKeyword,
  onToggleAllVisible,
}: Props) {
  const currentRows =
    activeTab === "keywords" ? filteredKeywords : filteredPages;

  const handleCopy = async () => {
    const text = JSON.stringify(currentRows, null, 2);
    await navigator.clipboard.writeText(text);
    toast.success("Copied data");
  };

  const handleDownload = (extension: "csv" | "xls") => {
    const rows =
      activeTab === "keywords"
        ? keywordsToCsv(filteredKeywords)
        : pagesToCsv(filteredPages);
    downloadCsv(rows, `${overview.domain}-${activeTab}.${extension}`);

    if (extension === "csv") {
      captureClientEvent("data:export", {
        source_feature: "domain_overview",
        result_count: currentRows.length,
      });
    }
  };

  const isKeywordsTab = activeTab === "keywords";

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
        <div role="tablist" className="tabs tabs-box w-fit">
          <button
            role="tab"
            className={`tab ${activeTab === "keywords" ? "tab-active" : ""}`}
            onClick={() => onTabChange("keywords")}
          >
            Top Keywords
          </button>
          <button
            role="tab"
            className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
            onClick={() => onTabChange("pages")}
          >
            Top Pages
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "keywords" ? (
            <button
              className="btn btn-sm"
              onClick={onSaveKeywords}
              disabled={selectedKeywords.size === 0}
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
              className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-48"
            >
              <li>
                <button onClick={handleCopy}>
                  <Copy className="size-4" />
                  Copy data
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

      {isKeywordsTab ? (
        <>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
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
            <span className="text-sm text-base-content/60">
              {filteredKeywords.length} keywords
            </span>
            <div className="flex-1" />
            <label className="input input-bordered input-sm w-full max-w-xs flex items-center gap-2">
              <Search className="size-4 text-base-content/60" />
              <input
                placeholder="Search in results"
                value={pendingSearch}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
          </div>

          {showFilters ? (
            <DomainFilterPanel
              filtersForm={filtersForm}
              activeFilterCount={activeFilterCount}
              resetFilters={resetFilters}
            />
          ) : null}
        </>
      ) : null}

      <div className="p-4">
        {isKeywordsTab ? (
          <DomainKeywordsTable
            rows={filteredKeywords}
            selectedKeywords={selectedKeywords}
            visibleKeywords={visibleKeywords}
            sortMode={sortMode}
            currentSortOrder={currentSortOrder}
            onSortClick={onSortClick}
            onToggleKeyword={onToggleKeyword}
            onToggleAllVisible={onToggleAllVisible}
          />
        ) : (
          <DomainPagesTable
            rows={filteredPages}
            sortMode={sortMode}
            currentSortOrder={currentSortOrder}
            onSortClick={onSortClick}
          />
        )}
      </div>
    </div>
  );
}
