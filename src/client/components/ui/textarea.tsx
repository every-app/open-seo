import * as React from "react";

import { cn } from "@/client/lib/utils";
import { formFieldBase, formFieldMultiLine } from "./_shared";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(formFieldBase, formFieldMultiLine, className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
