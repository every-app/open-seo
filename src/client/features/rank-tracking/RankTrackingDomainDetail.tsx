import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import {
  getLatestRankResults,
  estimateRankCheckCost,
} from "@/serverFunctions/rank-tracking";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Monitor,
  Plus,
  Settings,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { captureClientEvent } from "@/client/lib/posthog";
import { RankTrackingTable } from "./RankTrackingTable";
import { exportRankTrackingCsv } from "./RankTrackingTableParts";
import type {
  RankTrackingConfig,
  ComparePeriod,
} from "@/types/schemas/rank-tracking";
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
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { useRankCheckTrigger } from "./useRankCheckTrigger";
import { useRankRunPolling } from "./useRankRunPolling";

const COMPARE_PERIODS: ReadonlySet<string> = new Set([
  "1d",
  "7d",
  "30d",
  "90d",
]);
function isComparePeriod(v: string): v is ComparePeriod {
  return COMPARE_PERIODS.has(v);
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

function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="alert alert-warning text-sm py-2">
      <AlertTriangle className="size-4" />
      <span>
        We only start to track keyword positions once you{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="link font-medium"
        >
          upgrade to the paid plan
        </Link>
        .
      </span>
    </div>
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
    addedIds: string[];
    checkTriggered: boolean;
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
  const hasBothDevices = config.devices === "both";
  const showDesktop = hasBothDevices
    ? activeDevice === "desktop"
    : config.devices !== "mobile";
  const showMobile = hasBothDevices
    ? activeDevice === "mobile"
    : config.devices !== "desktop";
  const filtered = useMemo(
    () => applyFilters(rows ?? [], filters),
    [rows, filters],
  );
  const activeFilterCount = countActiveFilters(filters);
  const defaultSortId = showDesktop ? "desktopPosition" : "mobilePosition";

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
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 px-4 pt-4 pb-3">
          <div>
            <h2 className="text-lg font-semibold">{config.domain}</h2>
            <p className="text-xs text-base-content/60">
              {LOCATIONS[config.locationCode] ?? "US"} &middot;{" "}
              {devicesLabel(config.devices)} &middot;{" "}
              {scheduleLabel(config.scheduleInterval)}
              {run && (
                <>
                  {" "}
                  &middot; Last:{" "}
                  {new Date(run.lastCheckedAt).toLocaleDateString()}
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

        {/* Table toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-y border-base-300">
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

          {isRunning && latestRun ? (
            <div className="flex items-center gap-2 text-sm text-base-content/70">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>
                {latestRun.status === "pending"
                  ? "Preparing..."
                  : `Getting rankings for ${latestRun.keywordsTotal || "?"} keyword${latestRun.keywordsTotal !== 1 ? "s" : ""}...`}{" "}
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

          <select
            className="select select-bordered select-sm text-xs w-auto"
            value={comparePeriod}
            onChange={(e) => {
              if (isComparePeriod(e.target.value))
                setComparePeriod(e.target.value);
            }}
          >
            <option value="1d">Since yesterday</option>
            <option value="7d">Since last week</option>
            <option value="30d">Since last month</option>
            <option value="90d">Since 90 days ago</option>
          </select>

          {hasBothDevices && (
            <SegmentedToggle
              items={[
                {
                  value: "desktop" as const,
                  icon: <Monitor className="size-3.5" />,
                  label: "Desktop",
                },
                {
                  value: "mobile" as const,
                  icon: <Smartphone className="size-3.5" />,
                  label: "Mobile",
                },
              ]}
              value={activeDevice}
              onChange={setActiveDevice}
            />
          )}

          <ActionsMenu
            onCheckNow={() => {
              const count = costEstimate?.keywordCount ?? rows?.length ?? 0;
              if (count > 0) requestCheck(count);
            }}
            onExport={() =>
              exportRankTrackingCsv(
                filtered,
                showDesktop,
                showMobile,
                config.domain,
              )
            }
            onCopyKeywords={() => {
              const text = filtered.map((r) => r.keyword).join("\n");
              void navigator.clipboard.writeText(text);
              toast.success("Keywords copied to clipboard");
            }}
            isRunning={isBusy}
            hasData={filtered.length > 0}
            checkDisabled={isFreePlan}
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
            key={defaultSortId}
            totalCount={rows?.length ?? 0}
            rows={filtered}
            resultsLoading={resultsLoading}
            showDesktop={showDesktop}
            showMobile={showMobile}
            defaultSortId={defaultSortId}
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
