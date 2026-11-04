import { FileDown, Save, Sheet } from "lucide-react";
import {
  KeywordOverviewCard,
  SerpAnalysisCard,
} from "@/client/features/keywords/components";
import { ExportMenu } from "@/client/components/ExportMenu";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  DataTableFilterPanel,
  DataTableFilterToggle,
  DataTableToolbar,
} from "@/client/components/table/DataTableToolbar";
import type { KeywordResearchControllerState } from "./types";
import {
  FilterIntentSelect,
  FilterRangeInputs,
  FilterTextInput,
} from "./keywordResearchFilters";
import { KeywordResearchTable } from "./KeywordResearchTable";
import {
  KEYWORD_RESEARCH_PAGE_SIZES,
  useKeywordResearchPagination,
} from "./KeywordResearchPagination";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";

type Props = {
  controller: KeywordResearchControllerState;
};

// Below md the page shows one panel at a time behind tabs, and hides the
// keyword overview. From xl the table is the list and the panel beside it
// follows the selected row. The table sets the height of both, so their edges
// line up, and the panel stays in view while a table taller than the screen
// scrolls.
export function KeywordResearchResults({ controller }: Props) {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <MobileTabs controller={controller} />
      <div className="flex flex-col gap-4 xl:flex-row">
        <KeywordPanel controller={controller} />
        <KeywordDetailPanel controller={controller} />
      </div>
    </div>
  );
}

function MobileTabs({ controller }: Props) {
  return (
    <Tabs
      value={controller.mobileTab}
      onValueChange={controller.setMobileTab}
      className="mb-4 shrink-0 md:hidden"
    >
      <TabsList variant="line" className="w-full">
        <TabsTrigger value="keywords">
          Keywords ({controller.filteredRows.length})
        </TabsTrigger>
        <TabsTrigger value="serp">SERP Analysis</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function KeywordPanel({ controller }: Props) {
  const { mobileTab, searchedKeyword, showApproximateMatchNotice } = controller;

  return (
    <div
      className={`${mobileTab === "keywords" ? "flex" : "hidden md:flex"} order-2 xl:order-1 flex-col min-w-0 gap-2 xl:basis-3/5 xl:min-h-[32rem]`}
    >
      {showApproximateMatchNotice ? (
        <Alert variant="warning" role="status">
          <AlertDescription className="text-foreground">
            No exact match for{" "}
            <span className="font-medium">"{searchedKeyword}"</span>. Showing
            closest related keywords instead.
          </AlertDescription>
        </Alert>
      ) : null}
      <TableCard controller={controller} />
    </div>
  );
}

function TableCard({ controller }: Props) {
  const {
    activeFilterCount,
    filteredRows,
    rows,
    selectedKeywordRows,
    showFilters,
  } = controller;
  const { page, pageSize, pageRange, pageRows, setPage, setPageSize } =
    useKeywordResearchPagination(filteredRows);
  const keywordCount = filteredRows.length;

  const keywordCountLabel =
    selectedKeywordRows.length > 0
      ? `${selectedKeywordRows.length} selected`
      : activeFilterCount > 0
        ? `Showing ${keywordCount} of ${rows.length} keywords`
        : `Showing ${keywordCount} keywords`;

  return (
    <>
      <TableBulkActionBar
        selectedCount={selectedKeywordRows.length}
        onClear={() => controller.setSelectedRows(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<Save className="size-3.5" />}
              onClick={controller.handleSaveKeywords}
            >
              Save<span className="hidden md:inline"> Keywords</span>
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Export to Sheets",
                  icon: <Sheet className="size-4" />,
                  onClick: () => controller.exportSelection("sheets"),
                },
                {
                  label: "Export CSV",
                  icon: <FileDown className="size-4" />,
                  onClick: () => controller.exportSelection("csv"),
                },
              ]}
            />
          </div>
        }
      />
      <KeywordResearchTable
        filteredRows={pageRows}
        overviewKeyword={controller.overviewKeyword}
        selectedRows={controller.selectedRows}
        setSelectedRows={controller.setSelectedRows}
        sortDir={controller.sortDir}
        sortField={controller.sortField}
        toggleSort={controller.toggleSort}
        isFiltered={activeFilterCount > 0}
        resetFilters={controller.resetFilters}
        handleRowClick={controller.handleRowClick}
        serpLoadingKeyword={
          controller.serpLoading ? controller.activeSerpKeyword : null
        }
        toolbar={
          <>
            <DataTableToolbar
              actions={
                <ExportMenu
                  actions={["sheets", "csv"]}
                  onExport={controller.exportAll}
                  disabled={filteredRows.length === 0}
                />
              }
            >
              <DataTableFilterToggle
                open={showFilters}
                activeCount={activeFilterCount}
                onToggle={() =>
                  controller.setShowFilters((current) => !current)
                }
              />
              <span className="text-xs text-muted-foreground md:text-sm">
                {keywordCountLabel}
              </span>
            </DataTableToolbar>
            {showFilters ? <TableFilters controller={controller} /> : null}
          </>
        }
        footer={
          filteredRows.length > 0 ? (
            <div className="mt-auto">
              <TablePagination
                page={page}
                pageSize={pageSize}
                pageSizes={KEYWORD_RESEARCH_PAGE_SIZES}
                pageRange={pageRange}
                totalCount={filteredRows.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          ) : null
        }
      />
    </>
  );
}

function TableFilters({ controller }: Props) {
  const { activeFilterCount, filtersForm } = controller;

  return (
    <DataTableFilterPanel
      activeCount={activeFilterCount}
      onReset={controller.resetFilters}
    >
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

      <FilterIntentSelect form={filtersForm} />
    </DataTableFilterPanel>
  );
}

function KeywordDetailPanel({ controller }: Props) {
  const { mobileTab, overviewKeyword } = controller;

  return (
    // Size containment stops this column's content from adding height, so the
    // table alone decides how tall the row is.
    <div
      className={`${mobileTab === "serp" ? "block" : "hidden md:block"} order-1 min-w-0 xl:order-2 xl:basis-2/5 xl:[contain:size]`}
    >
      <div className="flex flex-col gap-2 xl:sticky xl:top-4 xl:h-full xl:max-h-[calc(100dvh-2.5rem)]">
        {overviewKeyword ? (
          <div className="hidden shrink-0 md:block">
            <KeywordOverviewCard keyword={overviewKeyword} />
          </div>
        ) : null}

        <SerpAnalysisCard
          items={controller.serpResults}
          keyword={controller.activeSerpKeyword}
          loading={controller.serpLoading}
          loadingMore={controller.serpLoadingMore}
          canLoadMore={controller.canLoadMoreSerp}
          error={controller.serpError}
          outOfCredits={controller.serpOutOfCredits}
          onRetry={controller.retrySerp}
          retrying={controller.serpRetrying}
          deepFetchFailed={controller.deepFetchFailed}
          page={controller.serpPage}
          pageSize={controller.SERP_PAGE_SIZE}
          onPageChange={controller.setSerpPage}
        />
      </div>
    </div>
  );
}
