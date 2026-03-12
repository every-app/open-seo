import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortOrder } from "@/client/features/domain/types";

type Props = {
  label: string;
  isActive: boolean;
  order: SortOrder;
  onClick: () => void;
};

export function SortableHeader({ label, isActive, order, onClick }: Props) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:text-base-content"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      <span>{label}</span>
      {isActive ? (
        order === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : null}
    </button>
  );
}
