import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";

import { cn } from "@/client/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}
RadioGroup.displayName = "RadioGroup";

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "aspect-square h-5 w-5 rounded-full",
        "backdrop-blur-xl bg-foreground/[0.06]",
        "border border-foreground/[0.15]",
        "shadow-[inset_0_0_0.25rem_color-mix(in_oklch,var(--halo)_6%,transparent)]",
        "transition-all duration-200",
        "hover:border-foreground/[0.25]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:border-primary-foreground/20",
        "data-checked:shadow-[0_0.125rem_0.25rem_-0.0625rem_color-mix(in_oklch,var(--shade)_30%,transparent),inset_0_0.0625rem_0_oklch(1_0_0/0.18)]",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-full flex items-center justify-center"
      >
        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-primary to-primary/85 shadow-[0_0.0625rem_0.125rem_color-mix(in_oklch,var(--shade)_35%,transparent),inset_0_0.0625rem_0_oklch(1_0_0/0.25)]" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
