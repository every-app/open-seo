import {
  CalendarDays,
  ChevronDown,
  Loader2,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Table,
  type LucideIcon,
} from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { ExportMenu, MoreMenu } from "./ToolbarMenus";
import type {
  RankTrackingKeywordScheduleInterval,
  RankTrackingKeywordSchedulesResponse,
} from "@/types/schemas/rank-tracking";

const KEYWORD_INTERVALS_API_PATH = "/api/rank-tracking/keyword-intervals";

export function rankTrackingKeywordSchedulesQueryKey(
  projectId: string,
  configId: string,
) {
  return ["rankTrackingKeywordSchedules", projectId, configId] as const;
}

async function parseKeywordIntervalResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  const body = await response.json().catch(() => null);
  const message =
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error
      : fallbackMessage;
  throw new Error(message);
}

export async function fetchRankTrackingKeywordSchedules({
  projectId,
  configId,
}: {
  projectId: string;
  configId: string;
}): Promise<RankTrackingKeywordSchedulesResponse> {
  const params = new URLSearchParams({ projectId, configId });
  const response = await fetch(`${KEYWORD_INTERVALS_API_PATH}?${params}`);
  return parseKeywordIntervalResponse(
    response,
    "Failed to load keyword schedules",
  );
}

export async function updateRankTrackingKeywordSchedules({
  projectId,
  configId,
  keywordIds,
  scheduleIntervalOverride,
}: {
  projectId: string;
  configId: string;
  keywordIds: string[];
  scheduleIntervalOverride: RankTrackingKeywordScheduleInterval;
}): Promise<{ updated: number }> {
  const response = await fetch(KEYWORD_INTERVALS_API_PATH, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      configId,
      keywordIds,
      scheduleIntervalOverride,
    }),
  });
  return parseKeywordIntervalResponse(
    response,
    "Failed to update keyword schedules",
  );
}

const KEYWORD_INTERVAL_ACTIONS: Array<{
  value: RankTrackingKeywordScheduleInterval;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "inherit",
    label: "Reset to inherited",
    description: "Use the domain schedule",
    icon: RotateCcw,
  },
  {
    value: "daily",
    label: "Daily",
    description: "Check once per day",
    icon: CalendarDays,
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Check once per week",
    icon: CalendarDays,
  },
  {
    value: "manual-paused",
    label: "Pause scheduled checks",
    description: "Manual checks still work",
    icon: Pause,
  },
];

export function KeywordIntervalMenu({
  onSelect,
  busy = false,
  disabled = false,
  label = "Schedule",
  title = "Set keyword schedule",
  dropdownClassName = "dropdown dropdown-end",
  buttonClassName,
  menuClassName = "dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-60",
}: {
  onSelect: (interval: RankTrackingKeywordScheduleInterval) => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string | null;
  title?: string;
  dropdownClassName?: string;
  buttonClassName?: string;
  menuClassName?: string;
}) {
  const buttonClasses =
    buttonClassName ??
    `btn btn-ghost btn-sm ${label ? "gap-1.5" : "btn-square"}`;

  return (
    <div className={dropdownClassName}>
      <button
        type="button"
        tabIndex={0}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-label={title}
        title={title}
        className={buttonClasses}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CalendarDays className="size-3.5" />
        )}
        {label}
        {label && <ChevronDown className="size-3 opacity-60" />}
      </button>
      <ul tabIndex={0} role="menu" className={menuClassName}>
        {KEYWORD_INTERVAL_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.value}>
              <button
                type="button"
                onClick={() => onSelect(action.value)}
                disabled={disabled || busy}
              >
                <Icon className="size-3.5" />
                <span className="flex flex-col items-start">
                  <span>{action.label}</span>
                  <span className="text-xs text-base-content/50">
                    {action.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RankTrackingTableToolbar({
  showFilters,
  onToggleFilters,
  activeFilterCount,
  isRunning,
  latestRun,
  keywordCount,
  viewMode,
  onViewModeChange,
  historyAvailable,
  onExport,
  onExportToSheets,
  onCopyKeywords,
  onCheckNow,
  onRefreshMetrics,
  metricsRefreshing,
  onSetKeywordInterval,
  intervalBusy,
  checkBusy,
  checkDisabled,
  hasData,
}: {
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  isRunning: boolean;
  latestRun:
    | { status: string; keywordsChecked: number; keywordsTotal: number }
    | null
    | undefined;
  keywordCount: number;
  viewMode: "table" | "history";
  onViewModeChange: (v: "table" | "history") => void;
  historyAvailable: boolean;
  onExport: () => void;
  onExportToSheets: () => void;
  onCopyKeywords: () => void;
  onCheckNow: () => void;
  onRefreshMetrics: () => void;
  metricsRefreshing: boolean;
  onSetKeywordInterval?: (
    interval: RankTrackingKeywordScheduleInterval,
  ) => void;
  intervalBusy?: boolean;
  checkBusy: boolean;
  checkDisabled: boolean;
  hasData: boolean;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-y border-base-300">
      {/* History needs at least two checks to compare; until then the toggle
          would only offer a worse copy of the Latest table. */}
      {historyAvailable && (
        <SegmentedToggle
          showLabels
          items={[
            {
              value: "table" as const,
              icon: <Table className="size-3.5" />,
              label: "Latest",
            },
            {
              value: "history" as const,
              icon: <CalendarDays className="size-3.5" />,
              label: "History",
            },
          ]}
          value={viewMode}
          onChange={onViewModeChange}
        />
      )}

      <button
        className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
        onClick={onToggleFilters}
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
          {keywordCount} keywords
        </span>
      )}

      <div className="flex-1" />

      {onSetKeywordInterval && (
        <KeywordIntervalMenu
          onSelect={onSetKeywordInterval}
          busy={intervalBusy}
          disabled={!hasData}
          title="Set schedule for listed keywords"
        />
      )}

      <ExportMenu
        onExport={onExport}
        onExportToSheets={onExportToSheets}
        onCopyKeywords={onCopyKeywords}
        hasData={hasData}
      />

      <MoreMenu
        onCheckNow={onCheckNow}
        checkBusy={checkBusy}
        checkDisabled={checkDisabled}
        onRefreshMetrics={onRefreshMetrics}
        metricsRefreshing={metricsRefreshing}
        hasData={hasData}
      />
    </div>
  );
}
