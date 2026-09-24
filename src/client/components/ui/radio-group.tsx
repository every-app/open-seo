import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";

import { cn } from "@/client/lib/utils";

/*
 * Atelier RadioGroup: quiet near-white wells; the selected indicator dot is
 * the primary button's material scaled down (deep green fill, top-light rim,
 * soft green drop via --shadow-primary), inside a green-edged ring.
 *
 * Base UI splits the Radix namespace: the group is a callable primitive and
 * items come from the Radio namespace (Radio.Root + Radio.Indicator). Items
 * render a <span>, so disabled styling hangs off data-disabled.
 */

// Base UI className can be a state function; the wrappers feed it to cn(), so
// narrow it to a plain string (same treatment as the other ported files).
type WithClassName<P> = Omit<P, "className"> & { className?: string };

const RadioGroup = React.forwardRef<
  HTMLDivElement,
  WithClassName<RadioGroupPrimitive.Props>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive
    data-slot="radio-group"
    ref={ref}
    className={cn("grid gap-2", className)}
    {...props}
  />
));
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<
  HTMLSpanElement,
  WithClassName<RadioPrimitive.Root.Props>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Root
    data-slot="radio-group-item"
    ref={ref}
    className={cn(
      "aspect-square h-4 w-4 shrink-0 rounded-full border border-border",
      "bg-input [box-shadow:var(--shadow-inset)]",
      "transition-[background-color,box-shadow,border-color] duration-150",
      "hover:border-ring/35",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:border-primary",
      className,
    )}
    {...props}
  >
    <RadioPrimitive.Indicator
      data-slot="radio-group-indicator"
      className="size-full flex items-center justify-center"
    >
      <span className="h-2 w-2 rounded-full bg-primary [box-shadow:var(--shadow-primary)]" />
    </RadioPrimitive.Indicator>
  </RadioPrimitive.Root>
));
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
