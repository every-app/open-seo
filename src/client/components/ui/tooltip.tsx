import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/client/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  TooltipPrimitive.Popup.Props &
    Pick<
      TooltipPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset"
    >
>(({ className, align, alignOffset, side, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className="isolate z-50"
    >
      <TooltipPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 overflow-hidden px-3 py-1.5 text-sm",
          "rounded-full border border-border",
          "backdrop-blur-2xl bg-foreground/[0.1]",
          "text-popover-foreground",
          "shadow-[0_0.25rem_1rem_color-mix(in_oklch,var(--shade)_40%,transparent),inset_0_0_0.375rem_color-mix(in_oklch,var(--halo)_8%,transparent)]",
          "transition-[transform,translate,scale,opacity] duration-150 data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
