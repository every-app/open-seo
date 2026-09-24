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
        default:
          "backdrop-blur-xl bg-white/[0.08] text-foreground " +
          "shadow-[inset_0_0_6px_oklch(1_0_0/0.1)]",
        primary:
          "backdrop-blur-xl bg-primary/20 text-primary " +
          "shadow-[inset_0_0_6px_oklch(0.62_0.2_256/0.18)]",
        signature:
          "backdrop-blur-xl bg-signature/20 text-signature " +
          "shadow-[inset_0_0_6px_oklch(0.72_0.19_52/0.2)]",
        secondary: "bg-white/[0.05] text-secondary-foreground",
        destructive: "bg-destructive/20 text-destructive",
        "destructive-light": "bg-destructive/10 text-destructive",
        success: "bg-emerald-500/20 text-emerald-400",
        "success-light": "bg-emerald-500/10 text-emerald-400",
        warning: "bg-orange-500/20 text-orange-400",
        "warning-light": "bg-orange-500/10 text-orange-400",
        outline: "border border-white/[0.15] text-foreground bg-transparent",
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
