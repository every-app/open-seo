import * as React from "react";
import { cn } from "@/client/lib/utils";

// Halo InputGroup: translucent pill input with prefix/suffix addons

interface InputGroupProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "prefix"
> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: "default" | "sm";
  disabled?: boolean;
  error?: boolean;
}

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  (
    {
      prefix,
      suffix,
      size = "default",
      disabled,
      error,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full items-stretch overflow-hidden",
          "rounded-full border border-white/10 backdrop-blur-xl bg-white/[0.06]",
          "shadow-[inset_0_0_6px_oklch(1_0_0/0.06)]",
          "transition duration-200 ease-out",
          "focus-within:shadow-[inset_0_0_6px_oklch(1_0_0/0.06),0_0_0_3px_oklch(0.62_0.2_256/0.2)] focus-within:border-primary/50",
          "hover:bg-white/[0.08] hover:border-white/[0.15]",
          error && [
            "border-destructive",
            "focus-within:border-destructive focus-within:shadow-[0_0_0_3px_hsl(var(--destructive)/0.12)]",
          ],
          disabled && "cursor-not-allowed opacity-70",
          size === "sm" && "rounded-2xl",
          className,
        )}
        {...props}
      >
        {/* Prefix addon */}
        {prefix && (
          <div
            className={cn(
              "flex items-center justify-center border-r border-white/10 bg-white/[0.04] px-3",
              "text-sm text-white/50 select-none shrink-0",
              "[&>svg]:h-4 [&>svg]:w-4",
              size === "default" ? "h-10" : "h-9",
            )}
          >
            {prefix}
          </div>
        )}

        {/* Input child */}
        <div
          className={cn(
            "flex-1 [&_input]:border-0 [&_input]:shadow-none [&_input]:rounded-none",
            "[&_input]:focus-visible:ring-0 [&_input]:focus-visible:shadow-none [&_input]:focus-visible:border-0",
            "[&_input]:h-full [&_input]:w-full [&_input]:bg-transparent",
            "[&_input]:text-white/90 [&_input]:placeholder:text-muted-foreground",
            disabled && "[&_input]:cursor-not-allowed",
          )}
        >
          {children}
        </div>

        {/* Suffix addon */}
        {suffix && (
          <div
            className={cn(
              "flex items-center justify-center border-l border-white/10 bg-white/[0.04] px-3",
              "text-sm text-white/50 select-none shrink-0",
              "[&>svg]:h-4 [&>svg]:w-4",
              size === "default" ? "h-10" : "h-9",
            )}
          >
            {suffix}
          </div>
        )}
      </div>
    );
  },
);
InputGroup.displayName = "InputGroup";

export { InputGroup };
export type { InputGroupProps };
