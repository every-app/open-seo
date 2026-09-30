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
          "rounded-full border border-border backdrop-blur-xl bg-foreground/[0.06]",
          "shadow-[inset_0_0_0.375rem_color-mix(in_oklch,var(--halo)_6%,transparent)]",
          "transition duration-200 ease-out",
          "focus-within:shadow-[inset_0_0_0.375rem_color-mix(in_oklch,var(--halo)_6%,transparent),0_0_0_0.1875rem_color-mix(in_oklch,var(--primary)_20%,transparent)] focus-within:border-primary/50",
          "hover:bg-foreground/[0.08] hover:border-foreground/[0.15]",
          error && [
            "border-destructive",
            "focus-within:border-destructive focus-within:shadow-[0_0_0_0.1875rem_color-mix(in_oklch,var(--destructive)_12%,transparent)]",
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
              "flex items-center justify-center border-r border-border bg-foreground/[0.04] px-3",
              "text-sm text-foreground/50 select-none shrink-0",
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
            "[&_input]:text-foreground/90 [&_input]:placeholder:text-foreground/40",
            disabled && "[&_input]:cursor-not-allowed",
          )}
        >
          {children}
        </div>

        {/* Suffix addon */}
        {suffix && (
          <div
            className={cn(
              "flex items-center justify-center border-l border-border bg-foreground/[0.04] px-3",
              "text-sm text-foreground/50 select-none shrink-0",
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
