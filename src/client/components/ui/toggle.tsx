import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

/*
 * Atelier Toggle: an understated pill; pressed state settles into the pale
 * mint wash with deep green text, like the reference's quiet highlights.
 */

const toggleVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium",
    "transition-[background-color,color,box-shadow] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
    "disabled:pointer-events-none disabled:opacity-50",
    "hover:bg-secondary hover:text-foreground",
    "data-pressed:bg-accent data-pressed:text-accent-foreground",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-transparent text-muted-foreground",
        outline:
          "border border-border bg-card text-foreground [box-shadow:var(--shadow-s)] hover:bg-secondary data-pressed:border-accent-foreground/20",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        lg: "h-10 px-4",
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
