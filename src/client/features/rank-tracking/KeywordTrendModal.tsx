import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import { reverse, sortBy } from "remeda";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { buildCsv, type CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";
import { captureClientEvent } from "@/client/lib/posthog";
import { getRankKeywordHistory } from "@/serverFunctions/rank-tracking";
import type { RankKeywordHistoryPoint } from "@/serverFunctions/rank-tracking";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { googleSerpUrl } from "@/shared/google-serp-url";
import { csvChange, DeviceRankCell } from "./RankTrackingTableParts";
import {
  RankTrendChart,
  TrendEmptyState,
  TrendRangeToggle,
  type TrendSeries,
} from "./RankTrackingTrendChart";

const DEVICE_STYLE: Record<
  "desktop" | "mobile",
  { label: string; color: string }
> = {
  desktop: { label: "Desktop", color: "#2563eb" },
  mobile: { label: "Mobile", color: "#14b8a6" },
};

export interface KeywordTrendTarget {
  trackingKeywordId: string;
  keyword: string;
}

export function KeywordTrendModal({
  target,
  projectId,
  configId,
  domain,
  locationCode,
  languageCode,
  locationName,
  serpDepth,
  onClose,
}: {
  target: KeywordTrendTarget;
  projectId: string;
  configId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  serpDepth: number;
  onClose: () => void;
}) {
  const [sinceDays, setSinceDays] = useState(730);

  const historyQuery = useQuery({
    queryKey: [
      "rankKeywordHistory",
      projectId,
      configId,
      target.trackingKeywordId,
      sinceDays,
    ],
    queryFn: () =>
      getRankKeywordHistory({
        data: {
          projectId,
          configId,
          trackingKeywordId: target.trackingKeywordId,
          sinceDays,
        },
      }),
  });
  const history = historyQuery.data;

  const points = useMemo(() => history ?? [], [history]);
  const devices = useMemo(() => deriveDevices(points), [points]);

  // A single run yields one point per device, so for a both-devices config
  // `points.length` is 2 after one check. The trend only fills in once any one
  // device has 2+ checks, so gate the empty state on the per-device count.
  const maxPerDevice = useMemo(
    () =>
      devices.length === 0
        ? 0
        : Math.max(
            ...devices.map((d) => points.filter((p) => p.device === d).length),
          ),
    [points, devices],
  );

  const series: TrendSeries[] = devices.map((device) => ({
    dataKey: device,
    name: DEVICE_STYLE[device].label,
    color: DEVICE_STYLE[device].color,
    strokeDasharray: "4 3",
  }));

  const chartData = useMemo(
    () => buildChartData(points, serpDepth),
    [points, serpDepth],
  );

  // Keys ("<ts>:<device>") whose plotted point sits in the bottom band because
  // the real position was null — so the tooltip can say "Not in top N"
  // unambiguously even when a genuine position equals serpDepth.
  const bottomBandKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of points) {
      if (p.position === null) {
        keys.add(`${new Date(p.checkedAt).getTime()}:${p.device}`);
      }
    }
    return keys;
  }, [points]);

  const historyRows = useMemo(() => buildHistoryRows(points), [points]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(
      buildCsv(HISTORY_HEADERS, historyRows.map(historyExportRow)),
    );
    toast.success("Copied to clipboard");
    captureClientEvent("rank_tracking:keyword_trend_copy");
  };

  const handleExport = () => {
    void exportRows({
      format: "csv",
      feature: "rank_tracking_keyword_trend",
      headers: HISTORY_HEADERS,
      rows: historyRows.map(historyExportRow),
      filename: `rank-history-${slugify(target.keyword)}`,
    });
    captureClientEvent("rank_tracking:keyword_trend_export");
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-3xl">
        <DialogHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <DialogTitle>{target.keyword}</DialogTitle>
            <DialogDescription className="text-xs">
              {domain} &middot;{" "}
              {locationName
                ? formatLocationLabel(locationName, 2)
                : (LOCATIONS[locationCode] ?? "US")}{" "}
              &middot; Position over time
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              title="Search this keyword on Google with the tracked language, country, and city"
              render={
                <a
                  href={googleSerpUrl(target.keyword, {
                    locationCode,
                    languageCode,
                    locationName,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink data-icon="inline-start" />
              Open on Google
            </Button>
            <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
          </div>
        </DialogHeader>

        <QueryState
          query={historyQuery}
          errorFallback="Failed to load keyword history"
          loading={<Skeleton className="h-56 w-full" />}
        >
          {() =>
            maxPerDevice <= 1 ? (
              <TrendEmptyState checks={maxPerDevice} />
            ) : (
              <>
                <RankTrendChart
                  data={chartData}
                  series={series}
                  serpDepth={serpDepth}
                  showBottomBand
                  valueFormatter={(value, item) => {
                    // The payload is the chart row, typed `any` upstream.
                    const row: unknown = item.payload;
                    const checkedAt =
                      typeof row === "object" &&
                      row !== null &&
                      "checkedAt" in row
                        ? row.checkedAt
                        : undefined;
                    return typeof checkedAt === "number" &&
                      typeof item.dataKey === "string" &&
                      bottomBandKeys.has(`${checkedAt}:${item.dataKey}`) ? (
                      <span className="font-normal text-muted-foreground">
                        Not in top {serpDepth}
                      </span>
                    ) : (
                      String(value)
                    );
                  }}
                />

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="xs" onClick={handleCopy}>
                    <Copy data-icon="inline-start" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="xs" onClick={handleExport}>
                    <Download data-icon="inline-start" />
                    Export CSV
                  </Button>
                </div>

                <div className="overflow-hidden rounded-lg border border-border">
                  <Table containerClassName="max-h-64">
                    <TableHeader className="sticky top-0 z-10 bg-popover">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        {devices.length > 1 && <TableHead>Device</TableHead>}
                        <TableHead>Position</TableHead>
                        <TableHead>Δ vs previous check</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRows.map((r, idx) => {
                        // No prior ranking to compare against (first check, or the
                        // previous check was unranked): show the lone position as a
                        // centered neutral pill so it doesn't look like a stray number
                        // next to the "before → after" rows.
                        const noPrevious =
                          r.position !== null && r.previousPosition === null;
                        return (
                          <TableRow key={`${r.device}-${r.checkedAt}-${idx}`}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(r.checkedAt).toLocaleDateString()}
                            </TableCell>
                            {devices.length > 1 && (
                              <TableCell className="text-xs">
                                {DEVICE_STYLE[r.device].label}
                              </TableCell>
                            )}
                            <TableCell>
                              {r.position === null ? (
                                <span className="text-xs text-muted-foreground">
                                  Not in top {serpDepth}
                                </span>
                              ) : (
                                <span className="font-mono text-sm">
                                  {r.position}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {noPrevious ? (
                                // Invisible placeholders matching the "before → after"
                                // layout so the lone pill lines up under the position
                                // badge column instead of floating.
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-6" aria-hidden />
                                  <span aria-hidden className="opacity-0">
                                    →
                                  </span>
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                                    {r.position}
                                  </span>
                                </span>
                              ) : (
                                <DeviceRankCell
                                  result={{
                                    position: r.position,
                                    previousPosition: r.previousPosition,
                                    rankingUrl: null,
                                    serpFeatures: [],
                                  }}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )
          }
        </QueryState>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

function deriveDevices(
  points: RankKeywordHistoryPoint[],
): Array<"desktop" | "mobile"> {
  const present = new Set(points.map((p) => p.device));
  return (["desktop", "mobile"] as const).filter((d) => present.has(d));
}

interface ChartRow extends Record<string, unknown> {
  checkedAt: number;
  desktop?: number;
  mobile?: number;
}

/**
 * Pivot flat rows into chart rows keyed by checkedAt (ms). A null position is
 * plotted at `serpDepth` so it renders inside the muted bottom band and the
 * line connects down to it (a drop), rather than leaving a silent gap.
 */
function buildChartData(
  points: RankKeywordHistoryPoint[],
  serpDepth: number,
): ChartRow[] {
  const byTime = new Map<number, ChartRow>();
  for (const p of points) {
    const ts = new Date(p.checkedAt).getTime();
    const row = byTime.get(ts) ?? { checkedAt: ts };
    row[p.device] = p.position === null ? serpDepth : p.position;
    byTime.set(ts, row);
  }
  return sortBy([...byTime.values()], (row) => row.checkedAt);
}

interface HistoryRow {
  device: "desktop" | "mobile";
  checkedAt: string;
  position: number | null;
  previousPosition: number | null;
}

/**
 * One row per snapshot (newest first) with the previous-check position for the
 * same device, so the Δ column can reuse DeviceRankCell's 4-case logic.
 */
function buildHistoryRows(points: RankKeywordHistoryPoint[]): HistoryRow[] {
  const prevByDevice = new Map<"desktop" | "mobile", number | null>();
  const rows: HistoryRow[] = [];
  // points are oldest-first; walk forward to capture the prior position.
  for (const p of points) {
    const hadPrevious = prevByDevice.has(p.device);
    rows.push({
      device: p.device,
      checkedAt: p.checkedAt,
      position: p.position,
      previousPosition: hadPrevious
        ? (prevByDevice.get(p.device) ?? null)
        : null,
    });
    prevByDevice.set(p.device, p.position);
  }
  return reverse(rows);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const HISTORY_HEADERS = ["Date", "Device", "Position", "Change vs previous"];

function historyExportRow(row: HistoryRow): CsvValue[] {
  return [
    new Date(row.checkedAt).toISOString(),
    DEVICE_STYLE[row.device].label,
    row.position ?? "",
    csvChange(row.position, row.previousPosition),
  ];
}
