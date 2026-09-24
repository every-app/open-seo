import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Icon } from "@iconify/react";

import { cn } from "@/client/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer h-5 w-5 shrink-0 rounded-xs",
        "backdrop-blur-xl bg-white/[0.06]",
        "border border-white/[0.15]",
        "shadow-[inset_0_0_4px_oklch(1_0_0/0.06)]",
        "transition-all duration-200",
        "hover:border-white/[0.25] hover:bg-white/[0.1]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-gradient-to-t data-checked:from-primary data-checked:to-primary/85 data-checked:text-primary-foreground",
        "data-checked:border-white/20",
        "data-checked:shadow-[0_2px_4px_-1px_oklch(0_0_0/0.3),inset_0_1px_0_oklch(1_0_0/0.22)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn("flex items-center justify-center text-current")}
      >
        <Icon icon="tabler:check" className="size-full h-3.5 w-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
Checkbox.displayName = "Checkbox";

export { Checkbox };
