import { CalendarDays, Loader2, SlidersHorizontal, Table } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { ExportMenu, MoreMenu } from "./ToolbarMenus";

import { Badge } from "@/client/components/ui/badge";
import { Progress } from "@/client/components/ui/progress";
import { Button } from "@/client/components/ui/button";
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
  checkBusy: boolean;
  checkDisabled: boolean;
  hasData: boolean;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-y border-border">
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

      <Button
        variant="ghost"
        size="sm"
        className={`gap-1.5 ${showFilters ? "bg-secondary text-foreground" : ""}`}
        onClick={onToggleFilters}
        title="Toggle table filters"
      >
        <SlidersHorizontal className="size-3.5" />
        Filters
        {activeFilterCount > 0 && (
          <Badge
            variant="primary"
            className="px-2 text-[11px] border-0 text-primary-foreground"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      {isRunning && latestRun ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>
            {latestRun.status === "pending"
              ? "Preparing..."
              : `Getting rankings for ${latestRun.keywordsTotal || "?"} keyword${latestRun.keywordsTotal !== 1 ? "s" : ""}...`}{" "}
            {latestRun.keywordsChecked}/{latestRun.keywordsTotal || "?"}
          </span>
          {latestRun.keywordsTotal > 0 && (
            <Progress
              className="w-24"
              value={latestRun.keywordsChecked}
              max={latestRun.keywordsTotal}
            />
          )}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">
          {keywordCount} keywords
        </span>
      )}

      <div className="flex-1" />

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
