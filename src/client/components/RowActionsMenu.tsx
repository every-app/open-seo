import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";

/** The kebab menu at the end of a table row. Children are `DropdownMenuItem`s. */
export function RowActionsMenu({
  label,
  children,
}: {
  /** Accessible name of the trigger, for example "Actions for Monthly check-in". */
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={label} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
