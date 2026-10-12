import { cn } from "cn";
import { Badge } from "@/client/components/ui/badge";
import { Progress } from "@/client/components/ui/progress";
import { DomainLevelBadge } from "@/client/features/ai-search/components/DomainLevelBadge";
import {
  formatCount,
  formatPlatformLabel,
} from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type ShareOfVoice = NonNullable<BrandLookupResult["shareOfVoice"]>;
type ShareEntry = ShareOfVoice["entries"][number];

/**
 * Competitor Share of Voice leaderboard. The server sorts entries descending by
 * mentions and flags `isTarget`; this component only renders. Bars are scaled to
 * the leader (the exact % is shown on every row, so nothing is hidden) so a
 * dominant competitor reads as a full bar and small shares stay visible.
 */
export function BrandLookupShareOfVoice({
  shareOfVoice,
  isDomainLevel,
}: {
  shareOfVoice: ShareOfVoice;
  /** True under a URL scope: SoV always compares whole domains. */
  isDomainLevel: boolean;
}) {
  const target = shareOfVoice.entries.find((entry) => entry.isTarget) ?? null;
  const maxPct = Math.max(
    0,
    ...shareOfVoice.entries.map((entry) => entry.sharePct ?? 0),
  );

  return (
    <div className="flex h-full flex-col rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Share of Voice</h3>
          {isDomainLevel ? (
            <DomainLevelBadge tooltip="Share of Voice compares whole domains — it is not narrowed to the page or folder you searched." />
          ) : null}
        </div>
        {target ? (
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{target.label}</span>{" "}
            {target.sharePct == null
              ? "· no comparable data"
              : `· ${Math.round(target.sharePct)}%`}
          </span>
        ) : null}
      </div>

      <ul className="flex-1 divide-y divide-border">
        {shareOfVoice.entries.map((entry, index) => (
          <LeaderboardRow
            key={entry.label}
            entry={entry}
            rank={index + 1}
            maxPct={maxPct}
          />
        ))}
      </ul>

      {/* Captions only the platforms actually summed — when one platform's
          cross_aggregated call failed, the leaderboard must not claim both. */}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Share of mentions on{" "}
        {shareOfVoice.platforms.map(formatPlatformLabel).join(" and ")}
      </p>
    </div>
  );
}

function LeaderboardRow({
  entry,
  rank,
  maxPct,
}: {
  entry: ShareEntry;
  rank: number;
  maxPct: number;
}) {
  const hasData = entry.mentions != null && entry.sharePct != null;
  const barWidth =
    hasData && maxPct > 0 ? ((entry.sharePct ?? 0) / maxPct) * 100 : 0;

  return (
    <li
      className={cn(
        "grid grid-cols-[1.25rem_minmax(0,1fr)_2.75rem] items-center gap-3 px-4 py-2.5",
        entry.isTarget && "bg-primary/5",
      )}
    >
      <span className="text-xs text-muted-foreground tabular-nums">{rank}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{entry.label}</span>
          {entry.isTarget ? <Badge size="sm">You</Badge> : null}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {/* Null mentions = "no data"; render a dash, not zero. */}
            {entry.mentions == null ? "—" : formatCount(entry.mentions)}
          </span>
        </div>
        <Progress
          value={barWidth}
          aria-label={`${entry.label} share of the leader`}
          className={cn(
            "mt-1.5 **:data-[slot=progress-track]:h-1.5",
            !entry.isTarget &&
              "**:data-[slot=progress-indicator]:bg-foreground/25",
          )}
        />
      </div>
      <span className="text-right text-sm font-medium tabular-nums">
        {hasData ? `${Math.round(entry.sharePct ?? 0)}%` : "—"}
      </span>
    </li>
  );
}
