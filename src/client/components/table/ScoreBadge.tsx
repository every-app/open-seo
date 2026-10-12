function scoreTierClass(value: number | null): string {
  if (value == null) return "score-tier-na";
  if (value <= 20) return "score-tier-1";
  if (value <= 35) return "score-tier-2";
  if (value <= 50) return "score-tier-3";
  if (value <= 65) return "score-tier-4";
  if (value <= 80) return "score-tier-5";
  return "score-tier-6";
}

/** Keyword difficulty (0-100) as a tier-colored badge. */
export function ScoreBadge({ value }: { value: number | null }) {
  return (
    <span
      className={`score-badge ${scoreTierClass(value)} inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums`}
    >
      {value ?? "-"}
    </span>
  );
}
