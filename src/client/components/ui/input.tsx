import * as React from "react";
import { cn } from "@/client/lib/utils";

// Halo Input — translucent field, softly rounded rectangle, bright-blue focus ring.

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-sm px-3.5 py-2 text-sm text-foreground",
          "backdrop-blur-xl bg-white/[0.06]",
          "border border-white/10",
          "shadow-[inset_0_1px_2px_oklch(0_0_0/0.18)]",
          "placeholder:text-muted-foreground",
          "transition-all duration-200 ease-out",
          "hover:bg-white/[0.08] hover:border-white/[0.15]",
          "focus-visible:outline-none focus-visible:border-primary/60",
          "focus-visible:shadow-[inset_0_1px_2px_oklch(0_0_0/0.18),0_0_0_3px_oklch(0.62_0.2_256/0.25)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
