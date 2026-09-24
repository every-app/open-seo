import type { ReactNode } from "react";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button, type ButtonProps } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";

/**
 * Kebab actions menu on the Atelier DropdownMenu. The menu renders in a
 * portal, so overflow containers (scrollable tables, overflow-hidden cards)
 * can't clip it. Opens below the trigger, right-aligned.
 */
export function PortalMenu({
  ariaLabel,
  triggerVariant = "ghost",
  triggerSize = "icon",
  triggerClassName = "size-7",
  triggerContent = <MoreHorizontal className="size-3.5" />,
  menuClassName = "w-40",
  children,
}: {
  ariaLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  triggerContent?: ReactNode;
  menuClassName?: string;
  /** DropdownMenuItem children; `close` dismisses the menu. */
  children: (close: () => void) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant={triggerVariant}
            size={triggerSize}
            className={triggerClassName}
            aria-label={ariaLabel}
          />
        }
      >
        {triggerContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuClassName}>
        {children(() => setIsOpen(false))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
