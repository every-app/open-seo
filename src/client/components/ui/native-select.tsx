import * as React from "react";
import { ChevronDown } from "@/client/components/icons";
import { cn } from "@/client/lib/utils";

// Halo NativeSelect: native <select> with translucent pill styling

interface NativeSelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  error?: boolean;
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "flex h-10 w-full appearance-none items-center",
            "rounded-full border border-white/10 backdrop-blur-xl bg-white/[0.06]",
            "pl-3 pr-9 py-2 text-sm text-white/90",
            "shadow-[inset_0_0_6px_oklch(1_0_0/0.06)]",
            "cursor-pointer",
            "transition duration-200 ease-out",
            "hover:bg-white/[0.08] hover:border-white/[0.15]",
            "focus:outline-none focus:shadow-[inset_0_0_6px_oklch(1_0_0/0.06),0_0_0_3px_oklch(0.62_0.2_256/0.2)] focus:border-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-70",
            "[&>option]:bg-zinc-900 [&>option]:text-white/90",
            error && [
              "border-destructive",
              "focus:border-destructive focus:shadow-[0_0_0_3px_hsl(var(--destructive)/0.12)]",
            ],
            className,
          )}
          {...props}
        >
          {children}
        </select>

        {/* Custom chevron icon */}
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
export type { NativeSelectProps };
