import { scoreTierClass } from "@/client/features/keywords/utils";

export function DifficultyBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="badge badge-ghost">-</span>;
  }

  return (
    <span
      className={`score-badge ${scoreTierClass(value)} inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold`}
    >
      {value}
    </span>
  );
}
