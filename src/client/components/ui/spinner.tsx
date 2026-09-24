import * as React from "react";
import { cn } from "@/client/lib/utils";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "default" | "lg";
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "animate-spin rounded-full border-2 border-white/10 border-t-primary",
        size === "sm" && "h-4 w-4",
        size === "default" && "h-6 w-6",
        size === "lg" && "h-8 w-8",
        className,
      )}
      {...props}
    />
  ),
);
Spinner.displayName = "Spinner";

export { Spinner };
