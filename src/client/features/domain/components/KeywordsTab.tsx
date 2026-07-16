import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FileSpreadsheet, Save, Sheet } from "lucide-react";
import { toast } from "sonner";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { DomainKeywordsPagination } from "@/client/features/domain/components/DomainKeywordsPagination";
import { DomainKeywordsTable } from "@/client/features/domain/components/DomainKeywordsTable";
import { DomainFilterPanel } from "@/client/features/domain/components/DomainFilterPanel";
import { DomainTableTabSurface } from "@/client/features/domain/components/DomainTableTabSurface";
import { saveSelectedKeywords } from "@/client/features/domain/domainActions";
import {
  KEYWORD_FILTER_FIELDS,
  buildKeywordsSearchUpdate,
  countKeywordFilterConditions,
} from "@/client/features/domain/domainFilterUtils";
import {
  debugDomain,
  useDomainRenderDebug,
} from "@/client/features/domain/domainDebug";
import { useDomainKeywordsQuery } from "@/client/features/domain/hooks/useDomainKeywordsQuery";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import { useDomainKeywordFilterPreferences } from "@/client/features/domain/useDomainFilterPreferences";
import {
  type DomainSortMode,
  type KeywordRow,
  type KeywordsFilterValues,
} from "@/client/features/domain/types";
import { keywordsToTable } from "@/client/features/domain/utils";
import type { DomainOverviewRouteState } from "@/client/features/domain/domainRouteState";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  MAX_DATAFORSEO_FILTER_CONDITIONS,
  type DomainSearchParams,
} from "@/types/schemas/domain";

type SearchUpdate = Partial<DomainSearchParams>;

const EMPTY_KEYWORDS: KeywordRow[] = [];
const KEYWORD_TEXT_FILTERS = [
  {
    key: "include",
    label: "Include Terms",
    placeholder: "audit, checker, template",
  },
  {
    key: "exclude",
    label: "Exclude Terms",
    placeholder: "jobs, salary, course",
  },
] as const;
const KEYWORD_RANGE_FILTERS = [
  { title: "Traffic", minKey: "minTraffic", maxKey: "maxTraffic" },
  { title: "Volume", minKey: "minVol", maxKey: "maxVol" },
  { title: "CPC (USD)", minKey: "minCpc", maxKey: "maxCpc", step: "0.01" },
  { title: "Score (KD)", minKey: "minKd", maxKey: "maxKd" },
  { title: "Rank", minKey: "minRank", maxKey: "maxRank" },
] as const;

type Props = {
  projectId: string;
  domain: string;
  routeState: DomainOverviewRouteState;
  canSaveKeywords: boolean;
  setSearchParams: (updates: SearchUpdate) => void;
  onSortClick: (sort: DomainSortMode) => void;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
};

export function KeywordsTab({
  projectId,
  domain,
  routeState,
  canSaveKeywords,
  setSearchParams,
  onSortClick,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filterPreferences = useDomainKeywordFilterPreferences(
    `${projectId}:${domain}`,
  );
  const {
    filters: preferredFilters,
    save: savePreferredFilters,
    clear: clearPreferredFilters,
  } = filterPreferences;
  const appliedFilters = routeState.hasAppliedKeywordFilters
    ? routeState.appliedFilters
    : preferredFilters;

  const query = useDomainKeywordsQuery({
    projectId,
    domain,
    includeSubdomains: routeState.subdomains,
    locationCode: routeState.sentLocationCode,
    page: routeState.page,
    pageSize: routeState.pageSize,
    sortMode: routeState.sort,
    sortOrder: routeState.order,
    appliedFilters,
    enabled: Boolean(domain),
  });

  const rows = query.data?.keywords ?? EMPTY_KEYWORDS;
  const totalCount = query.data?.totalCount ?? null;
  const hasNextPage = query.data?.hasMore ?? false;
  const isLoading = query.isFetching;
  const showTableLoading = isLoading && (showFilters || rows.length === 0);
  useDomainRenderDebug("KeywordsTab", {
    showFilters,
    isLoading,
    isPending: query.isPending,
    rows: rows.length,
    totalCount,
    selectedCount: selectedKeywords.size,
    activeTab: routeState.tab,
    page: routeState.page,
    sort: routeState.sort,
    order: routeState.order,
  });

  const visibleKeywords = useMemo(() => rows.map((r) => r.keyword), [rows]);
  useEffect(() => {
    const visibleSet = new Set(visibleKeywords);
    setSelectedKeywords((prev) => {
      const next = new Set([...prev].filter((k) => visibleSet.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKeywords]);

  const toggleKeywordSelection = useCallback((keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }, []);

  const saveMutation = useSaveKeywordsMutation({ projectId, queryClient });
  const handleSaveKeywords = useCallback(() => {
    saveSelectedKeywords({
      selectedKeywords,
      filteredKeywords: rows,
      save: saveMutation.mutate,
      projectId,
      locationCode: routeState.sentLocationCode,
    });
  }, [
    projectId,
    routeState.sentLocationCode,
    rows,
    saveMutation.mutate,
    selectedKeywords,
  ]);

  const applyFilters = useCallback(
    (values: KeywordsFilterValues) => {
      if (
        countKeywordFilterConditions(values) > MAX_DATAFORSEO_FILTER_CONDITIONS
      )
        return;
      const update = buildKeywordsSearchUpdate(values);
      debugDomain("KeywordsTab:apply-filters", { values, update });
      savePreferredFilters(values);
      setSearchParams(update);
    },
    [savePreferredFilters, setSearchParams],
  );

  const resetFilters = useCallback(() => {
    const update: SearchUpdate = { page: undefined };
    for (const key of KEYWORD_FILTER_FIELDS) update[key] = undefined;
    debugDomain("KeywordsTab:reset-filters", { update });
    clearPreferredFilters();
    setSearchParams(update);
  }, [clearPreferredFilters, setSearchParams]);

  const activeFilterCount = useMemo(
    () =>
      KEYWORD_FILTER_FIELDS.filter((k) => appliedFilters[k].trim() !== "")
        .length,
    [appliedFilters],
  );

  const exportTable = useMemo(() => keywordsToTable(rows), [rows]);
  const selectedExportTable = useMemo(
    () => keywordsToTable(rows.filter((r) => selectedKeywords.has(r.keyword))),
    [rows, selectedKeywords],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
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
      `${domain}-keywords.${extension}`,
      buildCsv(exportTable.headers, exportTable.rows),
    );
    if (extension === "csv") {
      captureClientEvent("data:export", {
        source_feature: "domain_overview",
        result_count: rows.length,
      });
    }
  };
  const handleExportSelectionToSheets = () => {
    void exportTableToSheets({
      headers: selectedExportTable.headers,
      rows: selectedExportTable.rows,
      feature: "domain_overview",
    });
  };
  const handleDownloadSelectionCsv = () => {
    downloadCsv(
      `${domain}-selected-keywords.csv`,
      buildCsv(selectedExportTable.headers, selectedExportTable.rows),
    );
    captureClientEvent("data:export", {
      source_feature: "domain_overview",
      result_count: selectedKeywords.size,
      scope: "selection",
    });
  };

  return (
    <>
      <TableBulkActionBar
        selectedCount={selectedKeywords.size}
        onClear={() => setSelectedKeywords(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<Save className="size-3.5" />}
              onClick={handleSaveKeywords}
              disabled={!canSaveKeywords}
            >
              Save Keywords
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Export to Sheets",
                  icon: <Sheet className="size-4" />,
                  onClick: handleExportSelectionToSheets,
                },
                {
                  label: "Download CSV",
                  icon: <Download className="size-4" />,
                  onClick: handleDownloadSelectionCsv,
                },
              ]}
            />
          </div>
        }
      />

      <DomainTableTabSurface
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((prev) => !prev)}
        activeFilterCount={activeFilterCount}
        countLabel="keywords"
        totalCount={totalCount}
        fallbackCount={rows.length}
        isLoading={isLoading}
        showTableLoading={showTableLoading}
        exportActions={[
          {
            label: "Export to Sheets",
            icon: <Sheet className="size-4" />,
            onClick: handleExportToSheets,
          },
          {
            label: "Copy data (JSON)",
            icon: <Copy className="size-4" />,
            onClick: handleCopy,
          },
          {
            label: "Download CSV",
            icon: <Download className="size-4" />,
            onClick: () => handleDownload("csv"),
          },
          {
            label: "Download Excel",
            icon: <FileSpreadsheet className="size-4" />,
            onClick: () => handleDownload("xls"),
          },
        ]}
        filterPanel={
          showFilters ? (
            <DomainFilterPanel
              debugName="KeywordsFilterPanel"
              activeFilterCount={activeFilterCount}
              appliedFilters={appliedFilters}
              fields={KEYWORD_FILTER_FIELDS}
              textFields={KEYWORD_TEXT_FILTERS}
              rangeFields={KEYWORD_RANGE_FILTERS}
              countConditions={countKeywordFilterConditions}
              onApply={applyFilters}
              onClear={resetFilters}
            />
          ) : null
        }
        pagination={
          <DomainKeywordsPagination
            page={routeState.page}
            pageSize={routeState.pageSize}
            totalCount={totalCount}
            hasNextPage={hasNextPage}
            isLoading={isLoading}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        }
      >
        <DomainKeywordsTable
          domain={domain}
          rows={rows}
          selectedKeywords={selectedKeywords}
          visibleKeywords={visibleKeywords}
          sortMode={routeState.sort}
          currentSortOrder={routeState.order}
          onSortClick={onSortClick}
          onToggleKeyword={toggleKeywordSelection}
        />
      </DomainTableTabSurface>
    </>
  );
}
