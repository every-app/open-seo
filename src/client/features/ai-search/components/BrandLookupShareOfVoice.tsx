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
}: {
  shareOfVoice: ShareOfVoice;
}) {
  const target = shareOfVoice.entries.find((entry) => entry.isTarget) ?? null;
  const maxPct = Math.max(
    0,
    ...shareOfVoice.entries.map((entry) => entry.sharePct ?? 0),
  );

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="flex items-baseline justify-between gap-2 border-b border-base-300 px-4 py-3">
        <h3 className="text-sm font-semibold">Share of Voice</h3>
        {target ? (
          <span className="text-xs text-base-content/50">
            <span className="font-medium text-base-content/80">
              {target.label}
            </span>{" "}
            {target.sharePct == null
              ? "· no comparable data"
              : `· ${Math.round(target.sharePct)}%`}
          </span>
        ) : null}
      </div>

      <ul className="flex-1 divide-y divide-base-200">
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
      <p className="border-t border-base-200 px-4 py-2 text-[11px] text-base-content/50">
        Mentions share across{" "}
        {shareOfVoice.platforms.map(formatPlatformLabel).join(" and ")} · bars
        relative to the leader.
      </p>
    </section>
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
      className={`grid grid-cols-[1.25rem_minmax(0,1fr)_2.75rem] items-center gap-3 px-4 py-2.5 ${
        entry.isTarget ? "bg-primary/5" : ""
      }`}
    >
      <span className="text-xs tabular-nums text-base-content/40">{rank}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{entry.label}</span>
          {entry.isTarget ? (
            <span className="badge badge-primary badge-xs border-0">You</span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-base-content/50">
            {/* Null mentions = "no data"; render a dash, not zero. */}
            {entry.mentions == null ? "—" : formatCount(entry.mentions)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-200">
          <div
            className={`h-full rounded-full ${
              entry.isTarget ? "bg-primary" : "bg-base-content/25"
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
      <span className="text-right text-sm font-medium tabular-nums">
        {hasData ? `${Math.round(entry.sharePct ?? 0)}%` : "—"}
      </span>
    </li>
  );
}
