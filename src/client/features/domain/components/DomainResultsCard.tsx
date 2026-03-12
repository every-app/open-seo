import {
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { DomainKeywordsTable } from "@/client/features/domain/components/DomainKeywordsTable";
import { DomainPagesTable } from "@/client/features/domain/components/DomainPagesTable";
import {
  downloadCsv,
  keywordsToCsv,
  pagesToCsv,
} from "@/client/features/domain/utils";
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
  };

  const isKeywordsTab = activeTab === "keywords";

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <DomainResultsCardHeader
          activeTab={activeTab}
          selectedKeywordsCount={selectedKeywords.size}
          onTabChange={onTabChange}
          onSaveKeywords={onSaveKeywords}
          onCopy={handleCopy}
          onDownload={handleDownload}
        />

        <div className="flex justify-end">
          <label className="input input-bordered input-sm w-full max-w-xs flex items-center gap-2">
            <Search className="size-4 text-base-content/60" />
            <input
              placeholder="Search in results"
              value={pendingSearch}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </div>

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

function DomainResultsCardHeader({
  activeTab,
  selectedKeywordsCount,
  onTabChange,
  onSaveKeywords,
  onCopy,
  onDownload,
}: {
  activeTab: DomainActiveTab;
  selectedKeywordsCount: number;
  onTabChange: (tab: DomainActiveTab) => void;
  onSaveKeywords: () => void;
  onCopy: () => Promise<void>;
  onDownload: (extension: "csv" | "xls") => void;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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

      <div className="flex flex-wrap gap-2">
        {activeTab === "keywords" ? (
          <button
            className="btn btn-sm"
            onClick={onSaveKeywords}
            disabled={selectedKeywordsCount === 0}
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
              <button onClick={onCopy}>
                <Copy className="size-4" />
                Copy data
              </button>
            </li>
            <li>
              <button onClick={() => onDownload("csv")}>
                <Download className="size-4" />
                Download CSV
              </button>
            </li>
            <li>
              <button onClick={() => onDownload("xls")}>
                <FileSpreadsheet className="size-4" />
                Download Excel
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
