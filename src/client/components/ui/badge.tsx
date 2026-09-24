import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

/*
 * Atelier Badge — the reference's quiet chips: the pale mint "+82%" pill and
 * warm gray reference-number tags. Flat fills, hairline rings, full pills.
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium " +
    "ring-1 ring-inset transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground ring-accent-foreground/15",
        primary: "bg-primary/10 text-primary ring-primary/25",
        secondary: "bg-secondary text-secondary-foreground ring-border",
        outline: "bg-transparent text-foreground ring-border",
        success:
          "bg-[oklch(0.93_0.05_152)] text-[oklch(0.4_0.08_152)] ring-[oklch(0.45_0.09_152)]/25",
        warning:
          "bg-[oklch(0.95_0.05_85)] text-[oklch(0.5_0.1_70)] ring-[oklch(0.55_0.12_75)]/25",
        destructive: "bg-destructive/10 text-destructive ring-destructive/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
