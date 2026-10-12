import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getLatestRankResults,
  getRankPositionMatrix,
  estimateRankCheckCost,
} from "@/serverFunctions/rank-tracking";
import { AlertTriangle } from "lucide-react";
import { QueryState } from "@/client/components/QueryState";
import { SkeletonCard } from "@/client/components/SkeletonPresets";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { useHostedPlanGate } from "@/client/features/billing/HostedPlanGate";
import { captureClientEvent } from "@/client/lib/posthog";
import { FreePlanAlert } from "./FreePlanAlert";
import { RankTrackingDetailHeader } from "./RankTrackingDetailHeader";
import { RankTrackingOverview } from "./RankTrackingOverview";
import { RankTrackingTable } from "./RankTrackingTable";
import {
  countMatrixRuns,
  RankTrackingHistoryMatrix,
} from "./RankTrackingHistoryMatrix";
import { RankTrackingTableToolbar } from "./RankTrackingTableToolbar";
import { exportRankTracking } from "./RankTrackingTableParts";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  rankTrackingDetailSearchSchema,
  type ComparePeriod,
  type RankTrackingDetailSearch,
} from "@/types/schemas/rank-tracking-search";
import { AddKeywordsPanel } from "./AddKeywordsPanel";
import {
  FilterPanel,
  applyFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./RankTrackingFilters";
import { CheckConfirmModal } from "./CheckConfirmModal";
import { useMetricsRefresh } from "./useMetricsRefresh";
import { useRankCheckTrigger } from "./useRankCheckTrigger";
import { useRankRunPolling } from "./useRankRunPolling";
import {
  filterValuesFromSearch,
  filterValuesToSearch,
  normalizeFilterValues,
} from "@/client/lib/filterSearchParams";
import { useDebouncedDraft } from "@/client/hooks/useDebouncedDraft";

function deviceVisibility(
  devices: RankTrackingConfig["devices"],
  activeDevice: "desktop" | "mobile",
): { showDesktop: boolean; showMobile: boolean } {
  if (devices === "both") {
    return {
      showDesktop: activeDevice === "desktop",
      showMobile: activeDevice === "mobile",
    };
  }
  return {
    showDesktop: devices !== "mobile",
    showMobile: devices !== "desktop",
  };
}

function defaultComparePeriod(
  interval: RankTrackingConfig["scheduleInterval"],
): ComparePeriod {
  if (interval === "daily") return "1d";
  if (interval === "monthly") return "30d";
  return "7d";
}

export function RankTrackingDomainDetail({
  config,
  projectId,
  search,
  onSearchChange,
  onEdit,
}: {
  config: RankTrackingConfig;
  projectId: string;
  search: RankTrackingDetailSearch;
  onSearchChange: (update: Partial<RankTrackingDetailSearch>) => void;
  onEdit: () => void;
}) {
  const planStatus = useHostedPlanGate();
  const queryClient = useQueryClient();
  const [showAddKeywords, setShowAddKeywords] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filters = useMemo(
    () => filterValuesFromSearch(search, EMPTY_FILTERS),
    [search],
  );
  const setFilters = (next: Filters) =>
    onSearchChange(filterValuesToSearch<RankTrackingDetailSearch>(next));
  // Held here, not in the panel, so closing the panel keeps a pending edit.
  const [filterDraft, setFilterDraft] = useDebouncedDraft(
    filters,
    setFilters,
    (values) => normalizeFilterValues(values, EMPTY_FILTERS),
  );
  const comparePeriod =
    search.compare ?? defaultComparePeriod(config.scheduleInterval);
  // A single-device config has only one device to show.
  const activeDevice =
    config.devices === "both" ? (search.device ?? "desktop") : config.devices;
  const viewMode = search.view ?? "table";

  // The route keys this component by config, so previous data here is always
  // the same domain at another compare period.
  const resultsQuery = useQuery({
    queryKey: ["rankTrackingResults", projectId, config.id, comparePeriod],
    queryFn: () =>
      getLatestRankResults({
        data: { projectId, configId: config.id, comparePeriod },
      }),
    placeholderData: keepPreviousData,
  });
  const resultsData = resultsQuery.data;

  const latestRun = useRankRunPolling(projectId, config.id);

  // Also feeds the History toggle: the matrix view only earns its tab once
  // there are two checks to compare.
  const { data: matrixCells } = useQuery({
    queryKey: ["rankPositionMatrix", projectId, config.id, activeDevice],
    queryFn: () =>
      getRankPositionMatrix({
        data: { projectId, configId: config.id, device: activeDevice },
      }),
  });
  const historyAvailable = countMatrixRuns(matrixCells ?? []) >= 2;

  const { data: costEstimate } = useQuery({
    queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    queryFn: () =>
      estimateRankCheckCost({ data: { projectId, configId: config.id } }),
  });

  const [pendingCheck, setPendingCheck] = useState<{
    count: number;
    keywordIds?: string[];
  } | null>(null);

  const handleKeywordsAdded = (result: {
    added: number;
    checkTriggered: boolean;
    checkScheduledSoon: boolean;
  }) => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingResults", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingLatestRun", projectId, config.id],
    });
    setShowAddKeywords(false);
    captureClientEvent("rank_tracking:keywords_add");
    toast.success(
      `${result.added} keyword${result.added !== 1 ? "s" : ""} added`,
    );
    if (result.checkScheduledSoon) {
      toast.info("The scheduled check within the hour covers these keywords");
    } else if (
      !result.checkTriggered &&
      result.added > 0 &&
      planStatus === "paid"
    ) {
      toast.info("Use 'Check rankings' to check these keywords");
    }
  };

  const isRunning =
    (latestRun?.status === "pending" || latestRun?.status === "running") &&
    !latestRun?.maybeStale;
  const { startCheck, isBusy, isPending } = useRankCheckTrigger({
    configId: config.id,
    isRunning,
    projectId,
    onSuccess: () => setPendingCheck(null),
  });

  const { refresh: refreshMetrics, isRefreshing: metricsRefreshing } =
    useMetricsRefresh(projectId, config.id);

  const requestCheck = (count: number, keywordIds?: string[]) => {
    if (count < 50) {
      startCheck({ keywordIds });
      return;
    }

    if (isBusy) return;
    setPendingCheck({ count, keywordIds });
  };

  const rows = resultsData?.rows;
  const run = resultsData?.run;
  const trackedKeywordCount = costEstimate?.keywordCount ?? rows?.length ?? 0;
  const hasBothDevices = config.devices === "both";
  const { showDesktop, showMobile } = deviceVisibility(
    config.devices,
    activeDevice,
  );
  const filtered = useMemo(
    () => applyFilters(rows ?? [], filters),
    [rows, filters],
  );
  const activeFilterCount = countActiveFilters(filters);
  const defaultSortId = showDesktop ? "desktopPosition" : "mobilePosition";
  // A position sort for the hidden device falls back to the default.
  const sortId =
    (search.sort === "desktopPosition" && !showDesktop) ||
    (search.sort === "mobilePosition" && !showMobile)
      ? undefined
      : search.sort;
  // Fall back to the table if history disappears (e.g. device switch).
  const effectiveViewMode = historyAvailable ? viewMode : "table";
  const exportFiltered = (format: "csv" | "sheets") =>
    exportRankTracking({
      format,
      rows: filtered,
      showDesktop,
      showMobile,
      domain: config.domain,
      locationName: config.locationName,
    });

  return (
    <div className="space-y-3">
      {config.lastSkipReason === "insufficient_credits" && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription className="text-foreground">
            Last scheduled check was skipped due to insufficient credits. Top up
            your balance to resume automatic tracking.
          </AlertDescription>
        </Alert>
      )}

      {latestRun?.maybeStale && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription className="text-foreground">
            This run may be unresponsive and will be cleaned up automatically.
          </AlertDescription>
        </Alert>
      )}

      {latestRun?.status === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription className="text-foreground">
            <p>
              <span className="font-medium">Last check failed.</span>{" "}
              {latestRun.errorMessage}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <FreePlanAlert visible={planStatus === "free"} />

      {/* Results card */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Domain header */}
        <RankTrackingDetailHeader
          config={config}
          run={run}
          costEstimate={costEstimate}
          hasBothDevices={hasBothDevices}
          activeDevice={activeDevice}
          onActiveDeviceChange={(device) =>
            // The sort column is per device, so a device switch resets it.
            onSearchChange({ device, sort: undefined, order: undefined })
          }
          comparePeriod={comparePeriod}
          onComparePeriodChange={(compare) => onSearchChange({ compare })}
          onEdit={onEdit}
          onToggleAddKeywords={() => setShowAddKeywords((c) => !c)}
        />

        {showAddKeywords && (
          <div className="px-4 pb-3">
            <AddKeywordsPanel
              configId={config.id}
              projectId={projectId}
              onSuccess={handleKeywordsAdded}
              onCancel={() => setShowAddKeywords(false)}
            />
          </div>
        )}

        {/* Portfolio overview */}
        {(rows?.length ?? 0) > 0 && (
          <RankTrackingOverview
            device={activeDevice}
            projectId={projectId}
            configId={config.id}
          />
        )}

        {/* Table toolbar */}
        <RankTrackingTableToolbar
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((c) => !c)}
          activeFilterCount={activeFilterCount}
          isRunning={isRunning}
          latestRun={latestRun}
          keywordCount={filtered.length}
          viewMode={effectiveViewMode}
          onViewModeChange={(view) =>
            onSearchChange({ view: view === "history" ? view : undefined })
          }
          historyAvailable={historyAvailable}
          onExport={(action) => {
            if (action !== "copy-list") return exportFiltered(action);
            void navigator.clipboard.writeText(
              filtered.map((r) => r.keyword).join("\n"),
            );
            toast.success("Keywords copied to clipboard");
          }}
          onCheckNow={() => {
            if (trackedKeywordCount > 0) requestCheck(trackedKeywordCount);
          }}
          onRefreshMetrics={refreshMetrics}
          metricsRefreshing={metricsRefreshing}
          trackedKeywordCount={trackedKeywordCount}
          checkBusy={isBusy}
          checkDisabled={planStatus !== "paid"}
          hasData={filtered.length > 0}
        />

        {/* Filters panel */}
        {showFilters && (
          <FilterPanel
            draft={filterDraft}
            setDraft={setFilterDraft}
            activeFilterCount={activeFilterCount}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
        )}

        {/* Table */}
        <div className="p-4">
          {effectiveViewMode === "history" ? (
            <RankTrackingHistoryMatrix
              cells={matrixCells ?? []}
              keywords={filtered.map((r) => ({
                trackingKeywordId: r.trackingKeywordId,
                keyword: r.keyword,
              }))}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          ) : (
            <QueryState
              query={resultsQuery}
              errorFallback="Failed to load rank data"
              loading={<SkeletonCard />}
            >
              {(results) => (
                <RankTrackingTable
                  key={defaultSortId}
                  totalCount={results.rows.length}
                  rows={filtered}
                  showDesktop={showDesktop}
                  showMobile={showMobile}
                  sorting={
                    sortId
                      ? [{ id: sortId, desc: search.order === "desc" }]
                      : [{ id: defaultSortId, desc: false }]
                  }
                  onSortingChange={(sorting) => {
                    onSearchChange({
                      sort: rankTrackingDetailSearchSchema.shape.sort.parse(
                        sorting[0]?.id,
                      ),
                      order: sorting[0]?.desc ? "desc" : undefined,
                    });
                  }}
                  domain={config.domain}
                  configId={config.id}
                  projectId={projectId}
                  locationCode={config.locationCode}
                  languageCode={config.languageCode}
                  locationName={config.locationName}
                  serpDepth={config.serpDepth}
                  onAddKeywords={() => setShowAddKeywords(true)}
                  onClearFilters={() => setFilters(EMPTY_FILTERS)}
                />
              )}
            </QueryState>
          )}
        </div>
      </div>

      {pendingCheck && (
        <CheckConfirmModal
          keywordCount={pendingCheck.count}
          devices={config.devices}
          costUsd={costEstimate?.costUsd}
          isPending={isPending}
          onRunNow={() =>
            startCheck({
              keywordIds: pendingCheck.keywordIds,
            })
          }
          onCancel={() => setPendingCheck(null)}
        />
      )}
    </div>
  );
}
