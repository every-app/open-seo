import { formatScore, scoreDelta, scoreTone } from "@/shared/pagespeed";

const TONE_CLASS = {
  good: "badge-success",
  average: "badge-warning",
  poor: "badge-error",
  none: "badge-ghost",
} as const;

/** A Lighthouse score badged on Google's own 90/50 bands, with the change
 *  since the previous scoring run. */
export function ScoreBadge({
  score,
  previous,
}: {
  score: number | null | undefined;
  previous: number | null | undefined;
}) {
  const delta = scoreDelta(score, previous);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`badge badge-sm ${TONE_CLASS[scoreTone(score)]}`}>
        {formatScore(score)}
      </span>
      {delta !== null && delta !== 0 ? (
        <span
          className={`text-[11px] tabular-nums ${
            delta > 0 ? "text-success" : "text-error"
          }`}
          title="Change since the previous run"
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      ) : null}
    </span>
  );
}
