import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

// Halo Button — translucent controls.
// default/primary: bright-blue vertical gradient, hairline white rim, soft drop shadow.
// secondary/outline/ghost: translucent over the dark canvas.

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "text-sm font-semibold tracking-tight leading-none",
    "rounded-full transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.98]",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        // Filled variants use the -strong fills: white text on plain
        // primary/destructive misses WCAG AA (3.8:1 and 4.2:1).
        default:
          "bg-gradient-to-t from-primary-strong to-primary-strong/85 text-primary-foreground " +
          "border border-primary-foreground/20 " +
          "shadow-[0_0.25rem_0.375rem_-0.0625rem_color-mix(in_oklch,var(--shade)_25%,transparent),inset_0_0.0625rem_0_oklch(1_0_0/0.18)] " +
          "hover:brightness-110",
        primary:
          "bg-gradient-to-t from-primary-strong to-primary-strong/85 text-primary-foreground " +
          "border border-primary-foreground/20 " +
          "shadow-[0_0.25rem_0.375rem_-0.0625rem_color-mix(in_oklch,var(--shade)_25%,transparent),inset_0_0.0625rem_0_oklch(1_0_0/0.18)] " +
          "hover:brightness-110",
        secondary:
          "backdrop-blur-xl bg-foreground/[0.08] text-foreground " +
          "border border-border " +
          "shadow-[inset_0_0.0625rem_0_oklch(1_0_0/0.08)] " +
          "hover:bg-foreground/[0.12]",
        outline:
          "bg-transparent text-foreground " +
          "border border-foreground/[0.15] " +
          "hover:bg-foreground/[0.06] hover:border-foreground/[0.25]",
        ghost:
          "bg-transparent text-muted-foreground " +
          "hover:bg-foreground/[0.06] hover:text-foreground",
        destructive:
          "bg-gradient-to-t from-destructive-strong to-destructive-strong/85 text-destructive-foreground " +
          "border border-destructive-foreground/15 " +
          "shadow-[0_0.25rem_0.375rem_-0.0625rem_color-mix(in_oklch,var(--shade)_25%,transparent)] " +
          "hover:brightness-110",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-12 px-5 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    Omit<ButtonPrimitive.Props, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Callers written against the Radix API pass the element to become as a
    // child: <Button asChild><Link>…</Link></Button>. Base UI has no asChild,
    // it composes through `render`. Without this the prop reaches the DOM and
    // the anchor nests inside the button instead of replacing it, which stacks
    // the icon above the label and puts a link inside a button.
    if (asChild && React.isValidElement(props.children)) {
      const { children, ...rest } = props;
      return (
        <ButtonPrimitive
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...rest}
          // After the spread, so an explicit asChild child wins over a stray
          // render prop rather than being silently replaced by it.
          // SAFETY: this branch runs only when `asChild` is set, and the caller then
          // owns passing a single element for the slot to clone.
          render={children as React.ReactElement}
        />
      );
    }

    return (
      <ButtonPrimitive
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
