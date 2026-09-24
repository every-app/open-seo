import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/client/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "backdrop-blur-xl bg-white/[0.1]",
        "border border-white/10",
        "shadow-[inset_0_0_6px_oklch(1_0_0/0.08)]",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-gradient-to-t data-checked:from-primary data-checked:to-primary/85 data-checked:border-white/20",
        "data-checked:shadow-[0_2px_4px_-1px_oklch(0_0_0/0.3),inset_0_1px_0_oklch(1_0_0/0.22)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full",
          "bg-white shadow-[0_1px_3px_oklch(0_0_0/0.3)]",
          "transition-transform duration-200",
          "data-checked:translate-x-5 data-unchecked:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
