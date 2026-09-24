import * as React from "react";
import { cn } from "@/client/lib/utils";

const StatCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl p-6",
      "backdrop-blur-xl bg-white/[0.06] border border-white/10",
      "shadow-[inset_0_0_8px_oklch(1_0_0/0.06)]",
      className,
    )}
    {...props}
  />
));
StatCard.displayName = "StatCard";

const StatCardLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
StatCardLabel.displayName = "StatCardLabel";

const StatCardValue = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-3xl font-bold tracking-tight", className)}
    {...props}
  />
));
StatCardValue.displayName = "StatCardValue";

const StatCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-muted-foreground mt-1", className)}
    {...props}
  />
));
StatCardDescription.displayName = "StatCardDescription";

export { StatCard, StatCardLabel, StatCardValue, StatCardDescription };
