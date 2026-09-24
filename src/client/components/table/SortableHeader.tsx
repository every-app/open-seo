import { ArrowDown, ArrowUp } from "lucide-react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";

import { Button } from "@/client/components/ui/button";
type SortableColumn = {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

export function SortableHeader({
  column,
  label,
  helpText,
  align,
}: {
  column: SortableColumn;
  label: string;
  helpText?: string;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const content = (
    <Button
      variant="ghost"
      className="h-auto rounded-md text-inherit px-0 hover:bg-transparent inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
      aria-pressed={!!sorted}
    >
      {helpText ? <HeaderHelpLabel label={label} helpText={helpText} /> : label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3 shrink-0" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3 shrink-0" />
      ) : null}
    </Button>
  );

  if (align === "right") {
    return <span className="flex w-full justify-end">{content}</span>;
  }

  return content;
}
