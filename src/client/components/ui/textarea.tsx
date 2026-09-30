import * as React from "react";
import { cn } from "@/client/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[5rem] w-full rounded-sm px-3.5 py-2 text-sm text-foreground",
          "backdrop-blur-xl bg-foreground/[0.06]",
          "border border-border",
          "shadow-[inset_0_0.0625rem_0.125rem_color-mix(in_oklch,var(--shade)_18%,transparent)]",
          "placeholder:text-muted-foreground",
          "transition-all duration-200 ease-out",
          "hover:bg-foreground/[0.08] hover:border-foreground/[0.15]",
          "focus-visible:outline-none focus-visible:border-primary/60",
          "focus-visible:shadow-[inset_0_0.0625rem_0.125rem_color-mix(in_oklch,var(--shade)_18%,transparent),0_0_0_0.1875rem_color-mix(in_oklch,var(--primary)_25%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
