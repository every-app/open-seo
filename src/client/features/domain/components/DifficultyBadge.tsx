import { scoreTierClass } from "@/client/features/keywords/utils";

export function DifficultyBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span
        className={`score-badge ${scoreTierClass(null)} inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums`}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={`score-badge ${scoreTierClass(value)} inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums`}
    >
      {value}
    </span>
  );
}
