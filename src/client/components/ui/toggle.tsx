import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

const toggleVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium",
    "transition-all duration-200",
    "hover:bg-white/[0.08] hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-pressed:bg-white/[0.1] data-pressed:text-foreground",
    "data-pressed:shadow-[inset_0_0_8px_oklch(1_0_0/0.12)]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-transparent text-muted-foreground",
        outline:
          "border border-white/10 bg-transparent text-muted-foreground " +
          "hover:border-white/[0.2] " +
          "data-pressed:border-white/[0.2]",
      },
      size: {
        sm: "h-8 px-2.5",
        default: "h-10 px-3",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Toggle = React.forwardRef<
  HTMLButtonElement,
  TogglePrimitive.Props & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
));
Toggle.displayName = "Toggle";

export { Toggle, toggleVariants };
