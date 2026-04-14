import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLatestRankResults,
  estimateRankCheckCost,
} from "@/serverFunctions/rank-tracking";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Plus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { captureClientEvent } from "@/client/lib/posthog";
import { RankTrackingTable, exportRankTrackingCsv } from "./RankTrackingTable";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import type { ComparePeriod } from "@/types/schemas/rank-tracking";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { ActionsMenu } from "./ActionsMenu";
import { AddKeywordsPanel } from "./AddKeywordsPanel";
import {
  FilterPanel,
  applyFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./RankTrackingFilters";
import { CheckConfirmModal } from "./CheckConfirmModal";
import { useRankCheckTrigger } from "./useRankCheckTrigger";
import { useRankRunPolling } from "./useRankRunPolling";
import { useRankTableSort } from "./useRankTableSort";

const COMPARE_PERIODS: ReadonlySet<string> = new Set([
  "previous",
  "7d",
  "30d",
  "90d",
]);
function isComparePeriod(v: string): v is ComparePeriod {
  return COMPARE_PERIODS.has(v);
}

export function RankTrackingDomainDetail({
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
  const queryClient = useQueryClient();
  const [showAddKeywords, setShowAddKeywords] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>("previous");

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ["rankTrackingResults", projectId, config.id, comparePeriod],
    queryFn: () =>
      getLatestRankResults({
        data: { projectId, configId: config.id, comparePeriod },
      }),
  });

  const latestRun = useRankRunPolling(projectId, config.id);

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
    addedIds?: string[];
  }) => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingResults", projectId, config.id],
    });
    setShowAddKeywords(false);
    captureClientEvent("rank_tracking:keywords_add");
    toast.success(
      `${result.added} keyword${result.added !== 1 ? "s" : ""} added`,
    );
    if (result.addedIds && result.addedIds.length > 0)
      requestCheck(result.addedIds.length, result.addedIds);
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

  const requestCheck = (count: number, keywordIds?: string[]) => {
    if (count < 50) {
      startCheck({ keywordIds });
      return;
    }

    if (isBusy) return;
    setPendingCheck({ count, keywordIds });
  };

  const rows = resultsData?.rows ?? [];
  const run = resultsData?.run;
  const showDesktop = config.devices !== "mobile";
  const showMobile = config.devices !== "desktop";
  const filtered = applyFilters(rows, filters);
  const activeFilterCount = countActiveFilters(filters);
  const defaultSort =
    config.devices === "desktop" ? "desktopPosition" : "mobilePosition";
  const { sorted, sortField, sortDir, handleSort } = useRankTableSort(
    filtered,
    defaultSort,
  );

  return (
    <div className="space-y-3">
      <button
        className="btn btn-ghost btn-xs gap-1 -ml-2 text-base-content/60"
        onClick={onBack}
      >
        <ArrowLeft className="size-3" />
        Back to domains
      </button>

      {/* Domain header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{config.domain}</h2>
          <p className="text-xs text-base-content/60">
            {LOCATIONS[config.locationCode] ?? "US"} &middot;{" "}
            {devicesLabel(config.devices)} &middot;{" "}
            {scheduleLabel(config.scheduleInterval)}
            {run && (
              <>
                {" "}
                &middot; Last: {new Date(run.startedAt).toLocaleDateString()}
              </>
            )}
            {costEstimate && costEstimate.keywordCount > 0 && (
              <> &middot; ~${costEstimate.costUsd.toFixed(2)}/check</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm gap-1" onClick={onEdit}>
            <Settings className="size-3.5" />
            Configure
          </button>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={() => setShowAddKeywords(!showAddKeywords)}
          >
            <Plus className="size-3.5" />
            Add Keywords
          </button>
        </div>
      </div>

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

      {showAddKeywords && (
        <AddKeywordsPanel
          configId={config.id}
          projectId={projectId}
          onSuccess={handleKeywordsAdded}
          onCancel={() => setShowAddKeywords(false)}
        />
      )}

      {/* Results card */}
      <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
        {/* Table toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300">
          <button
            className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
            onClick={() => setShowFilters((c) => !c)}
            title="Toggle table filters"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="badge badge-xs badge-primary border-0 text-primary-content">
                {activeFilterCount}
              </span>
            )}
          </button>
          <select
            className="select select-bordered select-sm text-xs"
            value={comparePeriod}
            onChange={(e) => {
              if (isComparePeriod(e.target.value))
                setComparePeriod(e.target.value);
            }}
          >
            <option value="previous">vs previous check</option>
            <option value="7d">vs 7 days ago</option>
            <option value="30d">vs 30 days ago</option>
            <option value="90d">vs 90 days ago</option>
          </select>

          {isRunning && latestRun ? (
            <div className="flex items-center gap-2 text-sm text-base-content/70">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>
                {latestRun.status === "pending"
                  ? "Preparing..."
                  : "Checking keywords..."}{" "}
                {latestRun.keywordsChecked}/{latestRun.keywordsTotal || "?"}
              </span>
              {latestRun.keywordsTotal > 0 && (
                <progress
                  className="progress progress-primary w-24"
                  value={latestRun.keywordsChecked}
                  max={latestRun.keywordsTotal}
                />
              )}
            </div>
          ) : (
            <span className="text-sm text-base-content/60">
              {filtered.length} keywords
            </span>
          )}

          <div className="flex-1" />

          <ActionsMenu
            onCheckNow={() => {
              const count = costEstimate?.keywordCount ?? rows.length;
              if (count > 0) requestCheck(count);
            }}
            onExport={() =>
              exportRankTrackingCsv(
                sorted,
                showDesktop,
                showMobile,
                config.domain,
              )
            }
            onCopyKeywords={() => {
              const text = sorted.map((r) => r.keyword).join("\n");
              void navigator.clipboard.writeText(text);
              toast.success("Keywords copied to clipboard");
            }}
            isRunning={isBusy}
            hasData={sorted.length > 0}
          />
        </div>

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
          <RankTrackingTable
            totalCount={rows.length}
            sorted={sorted}
            resultsLoading={resultsLoading}
            showDesktop={showDesktop}
            showMobile={showMobile}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            domain={config.domain}
            configId={config.id}
            projectId={projectId}
          />
        </div>
      </div>

      {pendingCheck && (
        <CheckConfirmModal
          keywordCount={pendingCheck.count}
          devices={config.devices}
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
