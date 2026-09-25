import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

// Base UI has no Label primitive: native <label>. select-none replaces the
// old primitive's behavior of preventing text selection on double click.

const labelVariants = cva(
  "text-sm font-medium leading-none text-foreground/80 select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<"label"> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = "Label";

export { Label };
