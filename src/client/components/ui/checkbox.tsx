import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "@/client/components/icons";

import { cn } from "@/client/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // inline-flex: the Root renders a <span>, which ignores width/height inline.
        "peer inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs",
        "backdrop-blur-xl bg-foreground/[0.06]",
        "border border-foreground/[0.15]",
        "shadow-[inset_0_0_0.25rem_color-mix(in_oklch,var(--halo)_6%,transparent)]",
        "transition-all duration-200",
        "hover:border-foreground/[0.25] hover:bg-foreground/[0.1]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-gradient-to-t data-checked:from-primary data-checked:to-primary/85 data-checked:text-primary-foreground",
        "data-checked:border-primary-foreground/20",
        "data-checked:shadow-[0_0.125rem_0.25rem_-0.0625rem_color-mix(in_oklch,var(--shade)_30%,transparent),inset_0_0.0625rem_0_oklch(1_0_0/0.22)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn("flex items-center justify-center text-current")}
      >
        <Check className="size-full h-3.5 w-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
Checkbox.displayName = "Checkbox";

export { Checkbox };
