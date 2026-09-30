import * as React from "react";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/client/lib/utils";

const Separator = React.forwardRef<
  HTMLDivElement,
  Omit<SeparatorPrimitive.Props, "className"> & {
    className?: string;
    /**
     * Accepted for API compatibility with the previous wrapper and ignored:
     * the Base UI separator is always semantic (role="separator").
     */
    decorative?: boolean;
  }
>(
  (
    {
      className,
      orientation = "horizontal",
      decorative: _decorative,
      ...props
    },
    ref,
  ) => (
    <SeparatorPrimitive
      ref={ref}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-foreground/10",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export { Separator };
