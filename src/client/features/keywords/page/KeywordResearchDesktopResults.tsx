import {
  FileDown,
  Globe,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import {
  AreaTrendChart,
  KeywordRow,
  OverviewStats,
  SerpAnalysisCard,
  SortHeader,
} from "@/client/features/keywords/components";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerState } from "./types";
import {
  EmptyFilterResults,
  FilterRangeInputs,
  FilterTextInput,
} from "./keywordResearchDesktopFilters";

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatTrendRangeLabel(trend: KeywordResearchRow["trend"]): string {
  if (trend.length === 0) return "Last 12 available months";

  const sorted = trend.toSorted(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
  const last12 = sorted.slice(-12);
  const start = last12[0];
  const end = last12[last12.length - 1];

  const toLabel = (month: number, year: number) => {
    const monthLabel = MONTH_SHORT_LABELS[month - 1] ?? `M${month}`;
    return `${monthLabel} ${year}`;
  };

  const startLabel = toLabel(start.month, start.year);
  const endLabel = toLabel(end.month, end.year);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchDesktopResults({ controller }: Props) {
  return (
    <div className="flex-1 hidden md:flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden gap-4 mt-2">
      <DesktopKeywordPanel controller={controller} />
      <DesktopSerpPanel controller={controller} />
    </div>
  );
}

function DesktopKeywordPanel({ controller }: Props) {
  const {
    lastResultSource,
    lastUsedFallback,
    searchedKeyword,
    showApproximateMatchNotice,
  } = controller;

  return (
    <div className="order-2 xl:order-1 flex flex-col min-w-0 gap-2 xl:flex-1">
      {showApproximateMatchNotice ? (
        <div
          className="rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-base-content"
          role="status"
        >
          No exact match for{" "}
          <span className="font-medium">"{searchedKeyword}"</span>. Showing
          closest related keywords instead.
          {lastUsedFallback ? (
            <span className="text-base-content/75">
              {" "}
              Source: {lastResultSource} fallback.
            </span>
          ) : null}
        </div>
      ) : null}
      {controller.overviewKeyword ? (
        <OverviewStats keyword={controller.overviewKeyword} />
      ) : null}
      <DesktopTableCard controller={controller} />
    </div>
  );
}

function DesktopTableCard({ controller }: Props) {
  const { activeFilterCount, filteredRows, rows, selectedRows, showFilters } =
    controller;

  const keywordCountLabel =
    selectedRows.size > 0
      ? `${selectedRows.size} of ${filteredRows.length} selected`
      : activeFilterCount > 0
        ? `Showing ${filteredRows.length} of ${rows.length} keywords`
        : `Showing ${filteredRows.length} keywords`;

  return (
    <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300">
        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
          onClick={() => controller.setShowFilters((current) => !current)}
          title="Toggle table filters"
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
          {keywordCountLabel}
        </span>
        <div className="flex-1" />
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={controller.handleSaveKeywords}
          disabled={selectedRows.size === 0}
        >
          <Save className="size-3.5" />
          <span className="hidden lg:inline">Save Keywords</span>
        </button>
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={controller.exportCsv}
          disabled={filteredRows.length === 0}
        >
          <FileDown className="size-3.5" />
          <span className="hidden lg:inline">Export</span>
        </button>
      </div>

      {showFilters ? <DesktopFilters controller={controller} /> : null}
      <DesktopTableHeader controller={controller} />
      <DesktopTableRows controller={controller} />
    </div>
  );
}

function DesktopFilters({ controller }: Props) {
  const { activeFilterCount, filtersForm } = controller;

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={controller.resetFilters}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={filtersForm}
          name="include"
          label="Include Terms"
          placeholder="audit, checker, template"
        />
        <FilterTextInput
          form={filtersForm}
          name="exclude"
          label="Exclude Terms"
          placeholder="jobs, salary, course"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <FilterRangeInputs
          form={filtersForm}
          title="Search Volume"
          minName="minVol"
          maxName="maxVol"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="CPC (USD)"
          minName="minCpc"
          maxName="maxCpc"
          step="0.01"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="Difficulty"
          minName="minKd"
          maxName="maxKd"
        />
      </div>
    </div>
  );
}

function DesktopTableHeader({ controller }: Props) {
  const { filteredRows, selectedRows } = controller;

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-base-300 bg-base-100 text-xs text-base-content/60 font-medium">
      <input
        type="checkbox"
        className="checkbox checkbox-xs shrink-0"
        checked={
          filteredRows.length > 0 && selectedRows.size === filteredRows.length
        }
        onChange={controller.toggleAllRows}
      />
      <SortHeader
        label="Keyword"
        field="keyword"
        current={controller.sortField}
        dir={controller.sortDir}
        onToggle={controller.toggleSort}
        className="flex-1 min-w-0"
      />
      <SortHeader
        label="Volume"
        field="searchVolume"
        current={controller.sortField}
        dir={controller.sortDir}
        onToggle={controller.toggleSort}
        className="w-16 text-right"
      />
      <SortHeader
        label="CPC"
        helpText="Cost per click in USD."
        field="cpc"
        current={controller.sortField}
        dir={controller.sortDir}
        onToggle={controller.toggleSort}
        className="w-14 text-right"
      />
      <SortHeader
        label="Comp."
        helpText="Advertiser competition."
        field="competition"
        current={controller.sortField}
        dir={controller.sortDir}
        onToggle={controller.toggleSort}
        className="w-12 text-right"
      />
      <SortHeader
        label="Score"
        helpText="Keyword difficulty score."
        field="keywordDifficulty"
        current={controller.sortField}
        dir={controller.sortDir}
        onToggle={controller.toggleSort}
        className="w-10 text-right"
      />
    </div>
  );
}

function DesktopTableRows({ controller }: Props) {
  const { activeFilterCount, filteredRows, overviewKeyword, selectedRows } =
    controller;

  return (
    <div className="flex-1 overflow-y-auto">
      {filteredRows.length === 0 ? (
        <EmptyFilterResults
          activeFilterCount={activeFilterCount}
          resetFilters={controller.resetFilters}
        />
      ) : (
        filteredRows.map((row) => (
          <KeywordRow
            key={row.keyword}
            row={row}
            isSelected={selectedRows.has(row.keyword)}
            isActive={overviewKeyword?.keyword === row.keyword}
            onToggle={() => controller.toggleRowSelection(row.keyword)}
            onClick={() => controller.handleRowClick(row)}
          />
        ))
      )}
    </div>
  );
}

function DesktopSerpPanel({ controller }: Props) {
  const { overviewKeyword } = controller;
  const trendRangeLabel = overviewKeyword
    ? formatTrendRangeLabel(overviewKeyword.trend)
    : "Last 12 available months";

  return (
    <div className="order-1 xl:order-2 flex flex-col min-w-0 gap-2 xl:flex-1">
      {overviewKeyword && overviewKeyword.trend.length > 0 ? (
        <div className="shrink-0 border border-base-300 rounded-xl bg-base-100 px-4 py-3">
          <h4 className="text-sm font-semibold mb-1">
            Search Trends{" "}
            <span className="font-normal text-base-content/50">
              {trendRangeLabel}
            </span>
          </h4>
          <AreaTrendChart trend={overviewKeyword.trend} />
        </div>
      ) : null}

      <div className="flex-1 flex flex-col overflow-hidden border border-base-300 rounded-xl bg-base-100">
        <div className="shrink-0 px-4 py-3 border-b border-base-300">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="size-3.5" />
            SERP Analysis
            {controller.activeSerpKeyword ? (
              <span className="font-normal text-base-content/50 truncate">
                : {controller.activeSerpKeyword}
              </span>
            ) : null}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <SerpAnalysisCard
            items={controller.serpResults}
            keyword={controller.activeSerpKeyword}
            loading={controller.serpLoading}
            error={controller.serpError}
            onRetry={() => void controller.serpQuery.refetch()}
            page={controller.serpPage}
            pageSize={controller.SERP_PAGE_SIZE}
            onPageChange={controller.setSerpPage}
          />
        </div>
      </div>
    </div>
  );
}
