import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import {
  getLatestRankResults,
  getRankPositionMatrix,
  estimateRankCheckCost,
} from "@/serverFunctions/rank-tracking";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { captureClientEvent } from "@/client/lib/posthog";
import { FreePlanAlert } from "./FreePlanAlert";
import { RankTrackingDetailHeader } from "./RankTrackingDetailHeader";
import { RankTrackingOverview } from "./RankTrackingOverview";
import { RankTrackingTable } from "./RankTrackingTable";
import {
  countMatrixRuns,
  RankTrackingHistoryMatrix,
} from "./RankTrackingHistoryMatrix";
import {
  RankTrackingTableToolbar,
  fetchRankTrackingKeywordSchedules,
  rankTrackingKeywordSchedulesQueryKey,
  updateRankTrackingKeywordSchedules,
} from "./RankTrackingTableToolbar";
import {
  exportRankTrackingCsv,
  exportRankTrackingToSheets,
} from "./RankTrackingTableParts";
import type {
  ComparePeriod,
  RankTrackingConfig,
  RankTrackingKeywordScheduleInterval,
  RankTrackingScheduledRow,
} from "@/types/schemas/rank-tracking";
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
import { getStandardErrorMessage } from "@/client/lib/error-messages";

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

export function RankTrackingDomainDetail(props: {
  config: RankTrackingConfig;
  projectId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <AutumnProvider>
      <RankTrackingDomainDetailInner {...props} />
    </AutumnProvider>
  );
}

function RankTrackingDomainDetailInner({
  config,
  projectId,
  onBack,
  onEdit,
}: {
  config: RankTrackingConfig;
  projectId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { data: session } = useSession();
  const customerQuery = useCustomer({
    queryOptions: { enabled: Boolean(session?.user?.id) },
  });
  const isFreePlan =
    !!customerQuery.data &&
    getCustomerPlanStatus(customerQuery.data) === "free";

  const queryClient = useQueryClient();
  const [showAddKeywords, setShowAddKeywords] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>(
    config.scheduleInterval === "daily" ? "1d" : "7d",
  );
  const [activeDevice, setActiveDevice] = useState<"desktop" | "mobile">(
    config.devices === "mobile" ? "mobile" : "desktop",
  );
  const [viewMode, setViewMode] = useState<"table" | "history">("table");

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ["rankTrackingResults", projectId, config.id, comparePeriod],
    queryFn: () =>
      getLatestRankResults({
        data: { projectId, configId: config.id, comparePeriod },
      }),
  });
  const resultRows = resultsData?.rows ?? [];

  const { data: keywordSchedules } = useQuery({
    queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, config.id),
    queryFn: () =>
      fetchRankTrackingKeywordSchedules({ projectId, configId: config.id }),
    enabled: resultRows.length > 0,
  });

  const latestRun = useRankRunPolling(projectId, config.id);

  // Also feeds the History toggle: the matrix view only earns its tab once
  // there are two checks to compare.
  const { data: matrixCells, isLoading: matrixLoading } = useQuery({
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
  }) => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingResults", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, config.id),
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingLatestRun", projectId, config.id],
    });
    setShowAddKeywords(false);
    captureClientEvent("rank_tracking:keywords_add");
    toast.success(
      `${result.added} keyword${result.added !== 1 ? "s" : ""} added`,
    );
    if (!result.checkTriggered && result.added > 0) {
      toast.info("Use 'Check Now' to check these keywords");
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

  const intervalMutation = useMutation({
    mutationFn: (input: {
      keywordIds: string[];
      scheduleIntervalOverride: RankTrackingKeywordScheduleInterval;
    }) =>
      updateRankTrackingKeywordSchedules({
        projectId,
        configId: config.id,
        ...input,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, config.id),
      });
      toast.success(
        `${result.updated} keyword schedule${result.updated !== 1 ? "s" : ""} updated`,
      );
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Failed to update keyword schedules"),
      );
    },
  });

  const setKeywordIntervals = (
    keywordIds: string[],
    scheduleIntervalOverride: RankTrackingKeywordScheduleInterval,
  ) => {
    if (keywordIds.length === 0) return;
    intervalMutation.mutate({ keywordIds, scheduleIntervalOverride });
  };

  const requestCheck = (count: number, keywordIds?: string[]) => {
    if (count < 50) {
      startCheck({ keywordIds });
      return;
    }

    if (isBusy) return;
    setPendingCheck({ count, keywordIds });
  };

  const rows = resultRows;
  const run = resultsData?.run;
  const hasBothDevices = config.devices === "both";
  const { showDesktop, showMobile } = deviceVisibility(
    config.devices,
    activeDevice,
  );
  const schedulesById = useMemo(
    () =>
      new Map(
        (keywordSchedules?.keywords ?? []).map((schedule) => [
          schedule.trackingKeywordId,
          schedule,
        ]),
      ),
    [keywordSchedules],
  );
  const rowsWithSchedules = useMemo<RankTrackingScheduledRow[]>(
    () =>
      rows.map((row) => {
        const schedule = schedulesById.get(row.trackingKeywordId);
        const scheduleIntervalOverride =
          schedule?.scheduleIntervalOverride ?? "inherit";
        const effectiveInterval =
          schedule?.effectiveInterval ??
          keywordSchedules?.configScheduleInterval ??
          config.scheduleInterval;
        const nextCheckAt = schedule?.nextCheckAt ?? null;

        return {
          ...row,
          scheduleIntervalOverride,
          effectiveInterval,
          nextCheckAt,
          effectiveNextCheckAt:
            scheduleIntervalOverride === "inherit"
              ? config.nextCheckAt
              : nextCheckAt,
        };
      }),
    [
      rows,
      schedulesById,
      keywordSchedules?.configScheduleInterval,
      config.scheduleInterval,
      config.nextCheckAt,
    ],
  );
  const filtered = useMemo(
    () => applyFilters(rowsWithSchedules, filters),
    [rowsWithSchedules, filters],
  );
  const activeFilterCount = countActiveFilters(filters);
  const defaultSortId = showDesktop ? "desktopPosition" : "mobilePosition";
  // Fall back to the table if history disappears (e.g. device switch).
  const effectiveViewMode = historyAvailable ? viewMode : "table";

  return (
    <div className="space-y-3">
      <button
        className="btn btn-ghost btn-xs gap-1 -ml-2 text-base-content/60"
        onClick={onBack}
      >
        <ArrowLeft className="size-3" />
        Back to domains
      </button>

      {config.lastSkipReason === "insufficient_credits" && (
        <div className="alert alert-warning text-sm py-2">
          <AlertTriangle className="size-4" />
          <span>
            Last scheduled check was skipped due to insufficient credits. Top up
            your balance to resume automatic tracking.
          </span>
        </div>
      )}

      {latestRun?.maybeStale && (
        <div className="alert alert-warning text-sm py-2">
          <AlertTriangle className="size-4" />
          <span>
            This run may be unresponsive and will be cleaned up automatically.
          </span>
        </div>
      )}

      <FreePlanAlert visible={isFreePlan} />

      {/* Results card */}
      <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
        {/* Domain header */}
        <RankTrackingDetailHeader
          config={config}
          run={run}
          costEstimate={costEstimate}
          hasBothDevices={hasBothDevices}
          activeDevice={activeDevice}
          onActiveDeviceChange={setActiveDevice}
          comparePeriod={comparePeriod}
          onComparePeriodChange={setComparePeriod}
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
        {rows.length > 0 && (
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
          onViewModeChange={setViewMode}
          historyAvailable={historyAvailable}
          onExport={() =>
            exportRankTrackingCsv(
              filtered,
              showDesktop,
              showMobile,
              config.domain,
            )
          }
          onExportToSheets={() =>
            exportRankTrackingToSheets(filtered, showDesktop, showMobile)
          }
          onCopyKeywords={() => {
            void navigator.clipboard.writeText(
              filtered.map((r) => r.keyword).join("\n"),
            );
            toast.success("Keywords copied to clipboard");
          }}
          onCheckNow={() => {
            const count = costEstimate?.keywordCount ?? rows.length;
            if (count > 0) requestCheck(count);
          }}
          onRefreshMetrics={refreshMetrics}
          metricsRefreshing={metricsRefreshing}
          onSetKeywordInterval={(interval) =>
            setKeywordIntervals(
              filtered.map((row) => row.trackingKeywordId),
              interval,
            )
          }
          intervalBusy={intervalMutation.isPending}
          checkBusy={isBusy}
          checkDisabled={isFreePlan}
          hasData={filtered.length > 0}
        />

        {/* Filters panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            activeFilterCount={activeFilterCount}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
        )}

        {/* Table */}
        <div className="p-4">
          {effectiveViewMode === "history" ? (
            <RankTrackingHistoryMatrix
              cells={matrixCells ?? []}
              isLoading={matrixLoading}
              keywords={filtered.map((r) => ({
                trackingKeywordId: r.trackingKeywordId,
                keyword: r.keyword,
              }))}
            />
          ) : (
            <RankTrackingTable
              key={defaultSortId}
              totalCount={rows.length}
              rows={filtered}
              resultsLoading={resultsLoading}
              intervalUpdatePending={intervalMutation.isPending}
              showDesktop={showDesktop}
              showMobile={showMobile}
              defaultSortId={defaultSortId}
              domain={config.domain}
              configId={config.id}
              projectId={projectId}
              locationCode={config.locationCode}
              serpDepth={config.serpDepth}
              onSetKeywordInterval={setKeywordIntervals}
            />
          )}
        </div>
      </div>

      {pendingCheck && (
        <CheckConfirmModal
          keywordCount={pendingCheck.count}
          devices={config.devices}
          serpDepth={config.serpDepth}
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
