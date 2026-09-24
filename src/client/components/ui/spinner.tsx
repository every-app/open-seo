import * as React from "react";
import { Icon } from "@iconify/react";

import { cn } from "@/client/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "default" | "lg";
}

const sizes = {
  sm: "h-3.5 w-3.5",
  default: "h-4 w-4",
  lg: "h-6 w-6",
};

const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = "default", ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <Icon
        icon="ph:spinner"
        className={cn("animate-spin text-muted-foreground", sizes[size])}
      />
    </span>
  ),
);
Spinner.displayName = "Spinner";

export { Spinner };
