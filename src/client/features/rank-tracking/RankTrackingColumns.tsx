import { useMemo, type MutableRefObject } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { makeSelectionColumn } from "@/client/components/table/AppDataTable";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
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

const HEADER_TOOLTIPS: Record<string, string> = {
  keyword: "The search term being tracked in Google",
  volume: "Estimated monthly search volume from Google",
  kd: "Keyword difficulty score (0-100) — higher means harder to rank",
  cpc: "Average cost per click in Google Ads (USD)",
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

// Local configs fetch volume scoped to the tracked city, so the header must
// say which number the user is looking at — national volume can overstate
// local demand by orders of magnitude.
function makeVolumeColumn(locationLabel?: string): ColumnDef<RankTrackingRow> {
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

const kdColumn: ColumnDef<RankTrackingRow> = {
  id: "kd",
  accessorFn: (row) => row.keywordDifficulty ?? undefined,
  header: ({ column }) => <SortableHeader column={column} label="KD" id="kd" />,
  size: 70,
  cell: ({ getValue }) => (
    <DifficultyCell value={getValue<number | undefined>() ?? null} />
  ),
  sortUndefined: "last",
};

const cpcColumn: ColumnDef<RankTrackingRow> = {
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
  onKeywordClick: (row: RankTrackingRow) => void,
): ColumnDef<RankTrackingRow> {
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

function makeDeviceColumn(
  device: "desktop" | "mobile",
): ColumnDef<RankTrackingRow> {
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
): ColumnDef<RankTrackingRow> {
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
): ColumnDef<RankTrackingRow> {
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
  onKeywordClick: (row: RankTrackingRow) => void;
  locationName?: string | null;
}): ColumnDef<RankTrackingRow>[] {
  const {
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick,
    locationName,
  } = options;
  const locationLabel = locationName
    ? formatLocationLabel(locationName, 2)
    : undefined;
  return useMemo(() => {
    const cols: ColumnDef<RankTrackingRow>[] = [
      makeSelectionColumn<RankTrackingRow>(selectAnchorRef),
      makeKeywordColumn(onKeywordClick),
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
  ]);
}
