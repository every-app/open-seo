import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/client/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "backdrop-blur-xl bg-foreground/[0.1]",
        "border border-border",
        "shadow-[inset_0_0_6px_color-mix(in_oklch,var(--halo)_8%,transparent)]",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-gradient-to-t data-checked:from-primary data-checked:to-primary/85 data-checked:border-primary-foreground/20",
        "data-checked:shadow-[0_2px_4px_-1px_color-mix(in_oklch,var(--shade)_30%,transparent),inset_0_1px_0_oklch(1_0_0/0.22)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full",
          "bg-primary-foreground shadow-[0_1px_3px_color-mix(in_oklch,var(--shade)_30%,transparent)]",
          "transition-transform duration-200",
          "data-checked:translate-x-5 data-unchecked:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
