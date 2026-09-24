import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg p-4 " +
    "border [box-shadow:var(--shadow-s)] " +
    "[&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border",
        info: "bg-card text-card-foreground border-primary/40 [&>svg]:text-primary",
        success:
          "bg-card text-card-foreground border-[oklch(0.5_0.15_145)]/40 [&>svg]:text-[oklch(0.78_0.15_145)]",
        warning:
          "bg-card text-card-foreground border-[oklch(0.55_0.18_55)]/40 [&>svg]:text-[oklch(0.82_0.14_80)]",
        destructive:
          "bg-card text-card-foreground border-destructive/40 [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
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
    className={cn(
      "text-sm text-muted-foreground leading-relaxed [&_p]:leading-relaxed",
      className,
    )}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
