import type { ComponentProps } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useCopy } from "@/client/hooks/useCopy";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * A Button that copies `value`. An `icon*` size shows only the icon and uses
 * `label` as the accessible name.
 */
export function CopyButton({
  value,
  successMessage,
  label = "Copy",
  onCopy,
  variant = "outline",
  size = "xs",
  className,
}: {
  value: string;
  successMessage: string;
  label?: string;
  onCopy?: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { copied, copy } = useCopy();
  const iconOnly = size?.startsWith("icon") ?? false;
  const Icon = copied ? Check : Copy;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-label={iconOnly ? label : undefined}
      onClick={() => {
        void copy(value, successMessage).then((ok) => {
          if (ok) onCopy?.();
        });
      }}
    >
      <Icon
        data-icon={iconOnly ? undefined : "inline-start"}
        className={copied && variant !== "default" ? "text-success" : undefined}
        aria-hidden
      />
      {iconOnly ? null : copied ? "Copied" : label}
    </Button>
  );
}
