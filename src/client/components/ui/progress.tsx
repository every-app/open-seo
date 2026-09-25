import * as React from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/client/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  Omit<ProgressPrimitive.Root.Props, "value"> & {
    value?: ProgressPrimitive.Root.Props["value"];
  }
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value ?? null}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full",
      "backdrop-blur-xl bg-foreground/[0.08]",
      "shadow-[inset_0_0_0.25rem_color-mix(in_oklch,var(--halo)_6%,transparent)]",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Track className="h-full w-full">
      <ProgressPrimitive.Indicator className="h-full w-full flex-1 rounded-full bg-primary/70 shadow-[0_0_0.5rem_color-mix(in_oklch,var(--primary)_30%,transparent)] transition-all" />
    </ProgressPrimitive.Track>
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };
