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
        "backdrop-blur-xl bg-white/[0.06]",
        "border border-white/[0.15]",
        "shadow-[inset_0_0_4px_oklch(1_0_0/0.06)]",
        "transition-all duration-200",
        "hover:border-white/[0.25]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:border-white/20",
        "data-checked:shadow-[0_2px_4px_-1px_oklch(0_0_0/0.3),inset_0_1px_0_oklch(1_0_0/0.18)]",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-full flex items-center justify-center"
      >
        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-primary to-primary/85 shadow-[0_1px_2px_oklch(0_0_0/0.35),inset_0_1px_0_oklch(1_0_0/0.25)]" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
