import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Icon } from "@iconify/react";

import { cn } from "@/client/lib/utils";

/*
 * Atelier Checkbox: unchecked it is a quiet near-white well; checked it
 * becomes the primary button's material scaled down: the same deep green
 * fill, top-light rim and soft green drop (--shadow-primary).
 *
 * Base UI splits Radix's checked="indeterminate" into a separate boolean
 * `indeterminate` prop; the Root renders a <span>, so disabled styling
 * hangs off data-disabled instead of the :disabled pseudo-class.
 */

// Base UI className can be a state function; the wrapper feeds it to cn(), so
// narrow it to a plain string (same treatment as the other ported files).
type WithClassName<P> = Omit<P, "className"> & { className?: string };

const Checkbox = React.forwardRef<
  HTMLSpanElement,
  WithClassName<CheckboxPrimitive.Root.Props>
>(({ className, indeterminate, ...props }, ref) => (
  <CheckboxPrimitive.Root
    data-slot="checkbox"
    ref={ref}
    indeterminate={indeterminate}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-border",
      "bg-input [box-shadow:var(--shadow-inset)]",
      "transition-[background-color,box-shadow,border-color] duration-150",
      "hover:border-ring/35",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:bg-primary data-checked:border-transparent data-checked:text-primary-foreground data-checked:[box-shadow:var(--shadow-primary)]",
      "data-indeterminate:bg-primary data-indeterminate:border-transparent data-indeterminate:text-primary-foreground data-indeterminate:[box-shadow:var(--shadow-primary)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className="size-full flex items-center justify-center text-current"
    >
      {indeterminate ? (
        <Icon icon="ph:minus-bold" className="h-3 w-3" />
      ) : (
        <Icon icon="ph:check-bold" className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
