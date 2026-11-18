import { useEffect, useMemo, useRef, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  PINNED_COLUMN_ID,
  useRankTrackingColumns,
} from "@/client/features/rank-tracking/RankTrackingColumns";
import { formatRelativeTime } from "@/client/lib/relative-time";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { WidgetTool, type RankTrackerData } from "@/shared/mcp-contracts";
import type { WidgetHost } from "./host";

const PAGE_SIZE = 100;
// get_rank_tracker's largest page.
const ROW_LIMIT = 1000;

type Config = NonNullable<RankTrackerData["config"]>;
type Device = "desktop" | "mobile";

const configLabel = (config: Config) =>
  config.locationName
    ? `${config.domain} · ${formatLocationLabel(config.locationName, 2)}`
    : config.domain;

/** A tracker's latest positions, read-only, in the app's own table. */
export function RankTrackerWidget({
  host,
  data,
}: {
  host: WidgetHost;
  data: RankTrackerData;
}) {
  // The first call lists the project's trackers; keep the list to switch
  // between them once one is open.
  const [configs] = useState(data.configs ?? []);
  const input = host.snapshot!.context.arguments;
  const open = (trackerId: string) =>
    host.call({
      tool: WidgetTool.RankTracker,
      arguments: { ...input, trackerId, limit: ROW_LIMIT },
    });
  const first = configs[0];
  // Open the first tracker once; after that the reader picks.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || data.config || !first) return;
    opened.current = true;
    host.call({
      tool: WidgetTool.RankTracker,
      arguments: { ...input, trackerId: first.id, limit: ROW_LIMIT },
    });
  }, [data.config, first, host, input]);

  if (!data.config || !data.results) {
    return first ? (
      <Skeleton className="h-24" />
    ) : (
      <p className="text-sm text-muted-foreground">No rank trackers yet.</p>
    );
  }
  return (
    <TrackerTable
      key={data.config.id}
      host={host}
      config={data.config}
      results={data.results}
      configs={configs}
      onOpen={open}
    />
  );
}

function TrackerTable({
  host,
  config,
  results,
  configs,
  onOpen,
}: {
  host: WidgetHost;
  config: Config;
  results: NonNullable<RankTrackerData["results"]>;
  configs: Config[];
  onOpen: (trackerId: string) => void;
}) {
  const [device, setDevice] = useState<Device>(
    config.devices === "mobile" ? "mobile" : "desktop",
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const columns = useRankTrackingColumns({
    showDesktop: device === "desktop",
    showMobile: device === "mobile",
    domain: config.domain,
    locationName: config.locationName,
  });
  // Pinned keywords sort first, as in the app. A new array every render would
  // keep the table recomputing its rows.
  const tableSorting = useMemo(
    () => [{ id: PINNED_COLUMN_ID, desc: false }, ...sorting],
    [sorting],
  );
  const table = useDataTable({
    data: results.rows,
    columns,
    state: {
      sorting: tableSorting,
      columnVisibility: { [PINNED_COLUMN_ID]: false },
      pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(tableSorting) : updater;
      setSorting(next.filter((sort) => sort.id !== PINNED_COLUMN_ID));
      setPage(1);
    },
    enableSortingRemoval: false,
    // The page is reset here on a sort; the table must not reset it itself.
    autoResetPageIndex: false,
    withSorting: true,
    withPagination: true,
    getRowId: (row) => row.trackingKeywordId,
  });
  const checkedAt = results.run?.lastCheckedAt ?? config.lastCheckedAt;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Rank Tracking</h1>
        <p className="break-all text-sm text-muted-foreground">
          {configLabel(config)}
          {checkedAt ? ` · Checked ${formatRelativeTime(checkedAt)}` : ""}
        </p>
      </div>
      {(configs.length > 1 || config.devices === "both") && (
        <div className="flex flex-wrap items-center gap-3">
          {configs.length > 1 && (
            <Select
              items={configs.map((item) => ({
                value: item.id,
                label: configLabel(item),
              }))}
              value={config.id}
              onValueChange={(value) => value && onOpen(value)}
            >
              <SelectTrigger
                aria-label="Rank tracker"
                className="w-72 max-w-full bg-card"
                disabled={host.busy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {configs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {configLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {config.devices === "both" && (
            <Tabs
              value={device}
              onValueChange={(value) =>
                setDevice(value === "mobile" ? "mobile" : "desktop")
              }
            >
              <TabsList>
                <TabsTrigger value="desktop">Desktop</TabsTrigger>
                <TabsTrigger value="mobile">Mobile</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      )}
      <DataTable
        table={table}
        isRefreshing={host.busy}
        empty={{ title: "No keywords yet" }}
        footer={
          results.rows.length > 0 ? (
            <>
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                {results.rows.length} of {results.totalCount} keywords
              </p>
              {results.rows.length > PAGE_SIZE ? (
                <TablePagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalCount={results.rows.length}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          ) : null
        }
      />
    </section>
  );
}
