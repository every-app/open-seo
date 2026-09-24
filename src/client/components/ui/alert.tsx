import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

const alertVariants = cva(
  [
    "relative w-full rounded-xl p-4",
    "backdrop-blur-xl border border-border",
    "shadow-[inset_0_0_8px_color-mix(in_oklch,var(--halo)_6%,transparent)]",
    // The icon centres on the first 20px text line (16px padding + 2px), so a
    // one-line alert sits centred in its box; the text is not nudged.
    "[&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-[18px] [&>svg]:text-foreground",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-foreground/[0.04] text-foreground",
        destructive:
          "bg-destructive/10 border-destructive/20 text-destructive [&>svg]:text-destructive",
        // Status tints for notices; the text stays foreground so it reads in
        // both themes, and the icon carries the status colour.
        warning:
          "bg-warning/10 border-warning/30 text-foreground [&>svg]:text-warning",
        info: "bg-info/10 border-info/30 text-foreground [&>svg]:text-info",
        success:
          "bg-success/10 border-success/30 text-foreground [&>svg]:text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
