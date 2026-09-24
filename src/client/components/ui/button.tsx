import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

/*
 * Atelier Button: quiet-luxury pills on light ground.
 *   - default IS the signature: a deep forest-green pill, a faint top light
 *     caught on its upper rim, one soft green-tinted drop shadow. Hover
 *     deepens the green like ink soaking in; press settles it flat.
 *   - secondary: the warm gray chip from the reference toolbar (USD, 6 Months).
 *   - outline / ghost stay hairline and understated; nothing shouts.
 */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-medium leading-none",
    "rounded-full cursor-pointer select-none",
    "transition-[background-color,border-color,box-shadow,transform] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px active:[box-shadow:var(--shadow-s)]",
  ].join(" "),
  {
    variants: {
      variant: {
        // The hero treatment lives on `default` (showcase + templates render
        // the primary CTA with no variant prop).
        default:
          "bg-primary text-primary-foreground " +
          "[box-shadow:var(--shadow-button)] " +
          "hover:bg-primary-hover hover:[box-shadow:var(--shadow-button-hover)]",
        primary:
          "bg-primary text-primary-foreground " +
          "[box-shadow:var(--shadow-button)] " +
          "hover:bg-primary-hover hover:[box-shadow:var(--shadow-button-hover)]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border " +
          "[box-shadow:var(--shadow-s)] " +
          "hover:bg-muted hover:border-ring/25",
        outline:
          "bg-card text-foreground border border-border " +
          "[box-shadow:var(--shadow-s)] " +
          "hover:bg-secondary hover:border-ring/25",
        ghost:
          "bg-transparent text-muted-foreground " +
          "hover:bg-secondary hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground " +
          "[box-shadow:inset_0_1px_0_oklch(1_0_0/0.16),0_1px_2px_oklch(0.3_0.12_28/0.12),0_3px_10px_-2px_oklch(0.3_0.12_28/0.1)] " +
          "hover:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        default: "h-9 px-5",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
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
