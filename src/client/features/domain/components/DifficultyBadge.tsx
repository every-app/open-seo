import { scoreTierClass } from "@/client/features/keywords/utils";
import { Badge } from "@/client/components/ui/badge";
import { cn } from "@/client/lib/utils";

export function DifficultyBadge({ value }: { value: number | null }) {
  return (
    <Badge
      className={cn(
        "size-6 px-0 text-[10px] font-semibold tabular-nums ring-1 ring-inset",
        scoreTierClass(value),
      )}
    >
      {value ?? "—"}
    </Badge>
  );
}
