import { useMemo, type MutableRefObject } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { ColumnDef, SortingFn } from "@tanstack/react-table";
import { makeSelectionColumn } from "@/client/components/table/AppDataTable";
import type {
  EffectiveKeywordScheduleInterval,
  RankTrackingKeywordScheduleInterval,
  RankTrackingScheduledRow,
} from "@/types/schemas/rank-tracking";
import { formatLocationLabel } from "@/shared/keyword-locations";
import {
  CpcCell,
  DeviceRankCell,
  DeviceUrlCell,
  DifficultyCell,
  SerpFeatureTags,
  VolumeCell,
} from "./RankTrackingTableParts";
import type { SelectionAnchor } from "@/client/components/table/tableSelection";
import { KeywordIntervalMenu } from "./RankTrackingTableToolbar";

const HEADER_TOOLTIPS: Record<string, string> = {
  keyword: "The search term being tracked in Google",
  volume: "Estimated monthly search volume from Google",
  kd: "Keyword difficulty score (0-100) — higher means harder to rank",
  cpc: "Average cost per click in Google Ads (USD)",
  interval: "How often this keyword is scheduled for automatic rank checks",
  nextCheck:
    "The next automatic rank check time for this keyword's effective schedule",
  desktopPosition:
    "Current Google ranking position, showing change from the comparison period",
  mobilePosition:
    "Current Google ranking position, showing change from the comparison period",
  url: "The page on your site that ranks for this keyword",
  serp: "Special result features appearing on the search results page (e.g. AI Overview, People Also Ask)",
};

export function SortableHeader({
  column,
  label,
  id,
  tooltip,
}: {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
  label: string;
  id: string;
  tooltip?: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs uppercase tracking-wide font-medium text-base-content/60 transition-colors hover:text-base-content"
      onClick={column.getToggleSortingHandler()}
      title={tooltip ?? HEADER_TOOLTIPS[id]}
      aria-label={`Sort by ${label}`}
      aria-pressed={!!sorted}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3 shrink-0" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3 shrink-0" />
      ) : null}
    </button>
  );
}

const nullsLastIsoDate: SortingFn<RankTrackingScheduledRow> = (
  rowA,
  rowB,
  columnId,
) => {
  const a = rowA.getValue<string | null>(columnId);
  const b = rowB.getValue<string | null>(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
};

// Local configs fetch volume scoped to the tracked city, so the header must
// say which number the user is looking at — national volume can overstate
// local demand by orders of magnitude.
function makeVolumeColumn(
  locationLabel?: string,
): ColumnDef<RankTrackingScheduledRow> {
  return {
    id: "volume",
    accessorFn: (row) => row.searchVolume ?? undefined,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={locationLabel ? "Local volume" : "Volume"}
        id="volume"
        tooltip={
          locationLabel
            ? `Estimated monthly searches in ${locationLabel} from Google Ads`
            : undefined
        }
      />
    ),
    size: 90,
    cell: ({ getValue }) => (
      <VolumeCell value={getValue<number | undefined>() ?? null} />
    ),
    sortUndefined: "last",
  };
}

const kdColumn: ColumnDef<RankTrackingScheduledRow> = {
  id: "kd",
  accessorFn: (row) => row.keywordDifficulty ?? undefined,
  header: ({ column }) => <SortableHeader column={column} label="KD" id="kd" />,
  size: 70,
  cell: ({ getValue }) => (
    <DifficultyCell value={getValue<number | undefined>() ?? null} />
  ),
  sortUndefined: "last",
};

const cpcColumn: ColumnDef<RankTrackingScheduledRow> = {
  id: "cpc",
  accessorFn: (row) => row.cpc ?? undefined,
  header: ({ column }) => (
    <SortableHeader column={column} label="CPC" id="cpc" />
  ),
  size: 80,
  cell: ({ getValue }) => (
    <CpcCell value={getValue<number | undefined>() ?? null} />
  ),
  sortUndefined: "last",
};

function makeKeywordColumn(
  onKeywordClick: (row: RankTrackingScheduledRow) => void,
): ColumnDef<RankTrackingScheduledRow> {
  return {
    id: "keyword",
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader column={column} label="Keyword" id="keyword" />
    ),
    cell: ({ row }) => (
      <button
        type="button"
        className="font-medium text-left link link-hover decoration-dotted underline-offset-2"
        onClick={() => onKeywordClick(row.original)}
        title="View position history"
      >
        {row.original.keyword}
      </button>
    ),
    sortingFn: "alphanumeric",
  };
}

function intervalLabel(
  interval:
    | RankTrackingKeywordScheduleInterval
    | EffectiveKeywordScheduleInterval,
): string {
  if (interval === "inherit") return "Inherit";
  if (interval === "daily") return "Daily";
  if (interval === "weekly") return "Weekly";
  if (interval === "manual-paused") return "Paused";
  return "Manual";
}

function formatNextCheck(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ScheduleIntervalCell({
  row,
  onKeywordIntervalChange,
  intervalActionBusy,
}: {
  row: RankTrackingScheduledRow;
  onKeywordIntervalChange?: (
    row: RankTrackingScheduledRow,
    interval: RankTrackingKeywordScheduleInterval,
  ) => void;
  intervalActionBusy?: boolean;
}) {
  const override = row.scheduleIntervalOverride;
  const isInherited = override === "inherit";
  const badgeClass =
    override === "manual-paused"
      ? "bg-warning/15 text-warning"
      : isInherited
        ? "bg-base-200 text-base-content/65"
        : "bg-primary/10 text-primary";

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex min-w-0 flex-col">
        <span
          className={`badge badge-sm border-0 font-medium ${badgeClass}`}
          title={`Effective interval: ${intervalLabel(row.effectiveInterval)}`}
        >
          {intervalLabel(override)}
        </span>
        {isInherited && (
          <span className="mt-0.5 text-[11px] leading-tight text-base-content/50">
            {intervalLabel(row.effectiveInterval)}
          </span>
        )}
      </span>
      {onKeywordIntervalChange && (
        <KeywordIntervalMenu
          label={null}
          title={`Set schedule for ${row.keyword}`}
          busy={intervalActionBusy}
          buttonClassName="btn btn-ghost btn-xs btn-square"
          menuClassName="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-60"
          onSelect={(interval) => onKeywordIntervalChange(row, interval)}
        />
      )}
    </div>
  );
}

function NextCheckCell({ row }: { row: RankTrackingScheduledRow }) {
  const scheduled =
    row.effectiveInterval === "daily" || row.effectiveInterval === "weekly";
  if (!scheduled) {
    return <span className="text-xs text-base-content/40">Not scheduled</span>;
  }
  if (row.effectiveNextCheckAt === null) {
    return <span className="text-xs font-medium text-warning">Due now</span>;
  }
  return (
    <span className="text-xs" title={row.effectiveNextCheckAt}>
      {formatNextCheck(row.effectiveNextCheckAt)}
    </span>
  );
}

function makeIntervalColumn(
  onKeywordIntervalChange?: (
    row: RankTrackingScheduledRow,
    interval: RankTrackingKeywordScheduleInterval,
  ) => void,
  intervalActionBusy?: boolean,
): ColumnDef<RankTrackingScheduledRow> {
  return {
    id: "interval",
    accessorKey: "scheduleIntervalOverride",
    header: ({ column }) => (
      <SortableHeader column={column} label="Interval" id="interval" />
    ),
    size: 140,
    cell: ({ row }) => (
      <ScheduleIntervalCell
        row={row.original}
        onKeywordIntervalChange={onKeywordIntervalChange}
        intervalActionBusy={intervalActionBusy}
      />
    ),
    sortingFn: "alphanumeric",
  };
}

const nextCheckColumn: ColumnDef<RankTrackingScheduledRow> = {
  id: "nextCheck",
  accessorKey: "effectiveNextCheckAt",
  header: ({ column }) => (
    <SortableHeader column={column} label="Next Check" id="nextCheck" />
  ),
  size: 140,
  cell: ({ row }) => <NextCheckCell row={row.original} />,
  sortingFn: nullsLastIsoDate,
};

function makeDeviceColumn(
  device: "desktop" | "mobile",
): ColumnDef<RankTrackingScheduledRow> {
  const id = device === "desktop" ? "desktopPosition" : "mobilePosition";
  return {
    id,
    accessorFn: (row) => row[device].position ?? undefined,
    header: ({ column }) => (
      <SortableHeader column={column} label="Position" id={id} />
    ),
    size: 120,
    maxSize: 140,
    cell: ({ row }) => <DeviceRankCell result={row.original[device]} />,
    sortUndefined: "last",
  };
}

function makeUrlColumn(
  device: "desktop" | "mobile",
  domain: string,
): ColumnDef<RankTrackingScheduledRow> {
  return {
    id: device === "desktop" ? "desktopUrl" : "mobileUrl",
    enableSorting: false,
    header: () => (
      <span
        className="text-xs uppercase tracking-wide font-medium text-base-content/60 cursor-help"
        title={HEADER_TOOLTIPS.url}
      >
        URL
      </span>
    ),
    size: 240,
    cell: ({ row }) => (
      <DeviceUrlCell result={row.original[device]} domain={domain} />
    ),
  };
}

function makeSerpColumn(
  device: "desktop" | "mobile",
): ColumnDef<RankTrackingScheduledRow> {
  return {
    id: device === "desktop" ? "desktopSerp" : "mobileSerp",
    enableSorting: false,
    header: () => (
      <span
        className="text-xs uppercase tracking-wide font-medium text-base-content/60 cursor-help"
        title={HEADER_TOOLTIPS.serp}
      >
        SERP Features
      </span>
    ),
    cell: ({ row }) => {
      const features = row.original[device].serpFeatures;
      if (features.length === 0) return null;
      return <SerpFeatureTags features={features} />;
    },
  };
}

export function useRankTrackingColumns(options: {
  showDesktop: boolean;
  showMobile: boolean;
  domain: string;
  selectAnchorRef: MutableRefObject<SelectionAnchor | null>;
  onKeywordClick: (row: RankTrackingScheduledRow) => void;
  locationName?: string | null;
  onSetKeywordInterval?: (
    row: RankTrackingScheduledRow,
    interval: RankTrackingKeywordScheduleInterval,
  ) => void;
  intervalUpdatePending?: boolean;
}): ColumnDef<RankTrackingScheduledRow>[] {
  const {
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick,
    locationName,
    onSetKeywordInterval: onKeywordIntervalChange,
    intervalUpdatePending: intervalActionBusy,
  } = options;
  const locationLabel = locationName
    ? formatLocationLabel(locationName, 2)
    : undefined;
  return useMemo(() => {
    const cols: ColumnDef<RankTrackingScheduledRow>[] = [
      makeSelectionColumn<RankTrackingScheduledRow>(selectAnchorRef),
      makeKeywordColumn(onKeywordClick),
      makeIntervalColumn(onKeywordIntervalChange, intervalActionBusy),
      nextCheckColumn,
    ];
    if (showDesktop) {
      cols.push(makeDeviceColumn("desktop"));
      cols.push(makeUrlColumn("desktop", domain));
    }
    if (showMobile) {
      cols.push(makeDeviceColumn("mobile"));
      cols.push(makeUrlColumn("mobile", domain));
    }
    cols.push(makeVolumeColumn(locationLabel), kdColumn, cpcColumn);
    if (showDesktop) {
      cols.push(makeSerpColumn("desktop"));
    }
    if (showMobile) {
      cols.push(makeSerpColumn("mobile"));
    }
    return cols;
  }, [
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick,
    locationLabel,
    onKeywordIntervalChange,
    intervalActionBusy,
  ]);
}
