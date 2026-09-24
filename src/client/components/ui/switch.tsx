"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/client/lib/utils";

/*
 * Atelier Switch: the track is a recessed near-white well; checked it adopts
 * the primary button's material (deep green fill + top-light rim + soft green
 * drop). The thumb is a small white pill under the same overhead key light.
 *
 * Base UI's Root renders a <span>, so disabled styling hangs off
 * data-disabled instead of the :disabled pseudo-class.
 */

// Base UI className can be a state function; the wrapper feeds it to cn(), so
// narrow it to a plain string (same treatment as the other ported files).
type WithClassName<P> = Omit<P, "className"> & { className?: string };

const Switch = React.forwardRef<
  HTMLSpanElement,
  WithClassName<SwitchPrimitive.Root.Props>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border",
      "bg-input [box-shadow:var(--shadow-inset)]",
      "transition-[background-color,box-shadow,border-color] duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:bg-primary data-checked:border-transparent data-checked:[box-shadow:var(--shadow-primary)]",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-card",
        "[box-shadow:var(--shadow-s)]",
        "ring-0 transition-transform duration-150",
        "data-checked:translate-x-4 data-checked:bg-primary-foreground",
        "data-unchecked:translate-x-0.5",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export { Switch };
