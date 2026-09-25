import { ArrowDown, ArrowUp } from "@/client/components/icons";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import type { SortOrder } from "@/client/features/domain/types";

import { Button } from "@/client/components/ui/button";
type Props = {
  label: string;
  helpText?: string;
  isActive: boolean;
  order: SortOrder;
  onClick: () => void;
};

export function SortableHeader({
  label,
  helpText,
  isActive,
  order,
  onClick,
}: Props) {
  return (
    <Button
      variant="ghost"
      className="h-auto rounded-md text-inherit px-0 hover:bg-transparent inline-flex items-center gap-1 font-medium hover:text-foreground"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      {helpText ? (
        <HeaderHelpLabel label={label} helpText={helpText} />
      ) : (
        <span>{label}</span>
      )}
      {isActive ? (
        order === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : null}
    </Button>
  );
}
