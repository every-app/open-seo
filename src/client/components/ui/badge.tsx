import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

// Halo Badge — translucent pill
// Small translucent surfaces with inset glow

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
  {
    variants: {
      variant: {
        // Tinted text reads the app's theme-aware text tokens: the base hues on
        // their own 20% tint miss WCAG AA in both themes.
        default:
          "backdrop-blur-xl bg-foreground/[0.08] text-foreground " +
          "shadow-[inset_0_0_6px_color-mix(in_oklch,var(--halo)_10%,transparent)]",
        primary:
          "backdrop-blur-xl bg-primary/20 text-link " +
          "shadow-[inset_0_0_6px_color-mix(in_oklch,var(--primary)_18%,transparent)]",
        signature:
          "backdrop-blur-xl bg-signature/20 text-signature " +
          "shadow-[inset_0_0_6px_color-mix(in_oklch,var(--signature)_20%,transparent)]",
        secondary: "bg-foreground/[0.05] text-secondary-foreground",
        destructive: "bg-destructive/20 text-negative",
        "destructive-light": "bg-destructive/10 text-negative",
        success: "bg-emerald-500/20 text-success",
        "success-light": "bg-emerald-500/10 text-success",
        warning: "bg-orange-500/20 text-warning",
        "warning-light": "bg-orange-500/10 text-warning",
        outline:
          "border border-foreground/[0.15] text-foreground bg-transparent",
      },
      size: {
        sm: "h-4 gap-1 px-1.5 text-[10px] uppercase tracking-wide",
        default: "h-5 gap-1.5 px-2 text-xs",
        lg: "h-6 gap-1.5 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
