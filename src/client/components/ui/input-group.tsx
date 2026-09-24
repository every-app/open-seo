import * as React from "react";

import { cn } from "@/client/lib/utils";

/*
 * InputGroup — composes an input with addons (icons, text, buttons) on either side.
 * Uses the same inset aesthetic as a regular input, but the group container takes
 * the shadow so all children sit "inside" the recessed surface.
 */

interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-stretch w-full rounded-md overflow-hidden",
        "bg-input border border-border [box-shadow:var(--shadow-inset)]",
        "transition-[border-color,box-shadow] duration-150",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = "InputGroup";

const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }
>(({ className, side = "left", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center px-3 text-sm text-muted-foreground bg-muted/30",
      side === "left" ? "border-r border-border" : "border-l border-border",
      className,
    )}
    {...props}
  />
));
InputGroupAddon.displayName = "InputGroupAddon";

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 flex-1 min-w-0 bg-transparent px-3 py-1.5 text-sm text-foreground",
      "placeholder:text-muted-foreground",
      "outline-none disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

export { InputGroup, InputGroupAddon, InputGroupInput };
