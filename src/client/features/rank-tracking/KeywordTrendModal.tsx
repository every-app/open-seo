import { useMemo, useState } from "react";
import { Copy, Download } from "@/client/components/icons";
import { reverse, sortBy } from "remeda";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { captureClientEvent } from "@/client/lib/posthog";
import { getRankKeywordHistory } from "@/serverFunctions/rank-tracking";
import type { RankKeywordHistoryPoint } from "@/serverFunctions/rank-tracking";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { csvChange, DeviceRankCell } from "./RankTrackingTableParts";
import {
  RankTrendChart,
  TrendRangeToggle,
  type TrendSeries,
} from "./RankTrackingTrendChart";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";

const DEVICE_STYLE: Record<
  "desktop" | "mobile",
  { label: string; color: string }
> = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", color: "var(--chart-3)" },
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
  locationName,
  serpDepth,
  onClose,
}: {
  target: KeywordTrendTarget;
  projectId: string;
  configId: string;
  domain: string;
  locationCode: number;
  locationName?: string;
  serpDepth: number;
  onClose: () => void;
}) {
  const [sinceDays, setSinceDays] = useState(730);

  const { data: history, isLoading } = useQuery({
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

  const exportRows = () =>
    historyRows.map((r) => [
      new Date(r.checkedAt).toISOString(),
      DEVICE_STYLE[r.device].label,
      r.position ?? "",
      csvChange(r.position, r.previousPosition),
    ]);

  const handleCopy = () => {
    const headers = ["Date", "Device", "Position", "Change vs previous"];
    void navigator.clipboard.writeText(buildCsv(headers, exportRows()));
    toast.success("Copied to clipboard");
    captureClientEvent("rank_tracking:keyword_trend_copy");
  };

  const handleExport = () => {
    const headers = ["Date", "Device", "Position", "Change vs previous"];
    downloadCsv(
      `rank-history-${slugify(target.keyword)}.csv`,
      buildCsv(headers, exportRows()),
    );
    captureClientEvent("rank_tracking:keyword_trend_export");
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="keyword-trend-title"
      maxWidth="max-w-3xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="keyword-trend-title" className="text-lg font-semibold">
            {target.keyword}
          </h3>
          <p className="text-xs text-muted-foreground">
            {domain} &middot;{" "}
            {locationName
              ? formatLocationLabel(locationName, 2)
              : (LOCATIONS[locationCode] ?? "US")}{" "}
            &middot; Position over time
          </p>
        </div>
        <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : maxPerDevice <= 1 ? (
        <EmptyState count={maxPerDevice} />
      ) : (
        <>
          <RankTrendChart
            data={chartData}
            series={series}
            serpDepth={serpDepth}
            showBottomBand
            renderTooltip={(label, entries) => (
              <ChartTooltip
                label={label}
                entries={entries}
                serpDepth={serpDepth}
                bottomBandKeys={bottomBandKeys}
              />
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 gap-1"
              onClick={handleCopy}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 gap-1"
              onClick={handleExport}
            >
              <Download className="size-3.5" />
              Export CSV
            </Button>
          </div>

          <Table containerClassName="max-h-64">
            <TableHeader className="sticky top-0 z-10 bg-popover backdrop-blur-xl">
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
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.checkedAt).toLocaleDateString()}
                    </TableCell>
                    {devices.length > 1 && (
                      <TableCell className="text-xs">
                        {DEVICE_STYLE[r.device].label}
                      </TableCell>
                    )}
                    <TableCell>
                      {r.position === null ? (
                        <span className="text-muted-foreground text-xs">
                          Not in top {serpDepth}
                        </span>
                      ) : (
                        <span className="font-mono text-sm">{r.position}</span>
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
                          <Badge
                            variant="secondary"
                            className="font-mono font-semibold"
                          >
                            {r.position}
                          </Badge>
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
        </>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {count === 0
        ? "No history yet — run a check to start tracking position over time."
        : "Only 1 check so far — the trend chart fills in after the next check."}
    </div>
  );
}

function ChartTooltip({
  label,
  entries,
  serpDepth,
  bottomBandKeys,
}: {
  label: number;
  entries: Array<{ dataKey?: string | number; value: number | null }>;
  serpDepth: number;
  bottomBandKeys: Set<string>;
}) {
  return (
    <div className="space-y-0.5 rounded-md border border-[var(--trend-tooltip-border)] bg-[var(--trend-tooltip-bg)] px-3 py-2 shadow-[0_0.5rem_1.5rem_var(--trend-tooltip-shadow)] backdrop-blur-xl">
      <p className="text-xs text-muted-foreground">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {entries.map((e) => {
        const device =
          e.dataKey === "desktop" || e.dataKey === "mobile"
            ? DEVICE_STYLE[e.dataKey].label
            : String(e.dataKey ?? "");
        const inBottomBand = bottomBandKeys.has(`${label}:${e.dataKey}`);
        return (
          <p key={String(e.dataKey)} className="text-sm font-medium">
            {device}:{" "}
            {inBottomBand ? (
              <span className="text-muted-foreground">
                Not in top {serpDepth}
              </span>
            ) : (
              e.value
            )}
          </p>
        );
      })}
    </div>
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
