import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";

/**
 * Two-step delete for a list row: the trash icon swaps to an explicit
 * Remove/Cancel pair, so a stray click can't destroy anything and no dialog
 * is needed. With `triggerLabel`, the trash icon becomes a text button.
 */
export function InlineConfirm({
  label,
  triggerLabel,
  confirmLabel = "Remove",
  pending,
  disabled = false,
  onConfirm,
}: {
  /** Accessible name of the trash button, for example "Remove openseo.so". */
  label: string;
  /** Show a text button, such as "Archive project", instead of the trash icon. */
  triggerLabel?: string;
  confirmLabel?: string;
  pending: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const size = triggerLabel ? "sm" : "xs";

  if (confirming) {
    return (
      <>
        <Button
          variant="destructive"
          size={size}
          disabled={pending || disabled}
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="ghost"
          size={size}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </>
    );
  }

  if (triggerLabel) {
    return (
      <Button
        variant="destructive"
        size={size}
        disabled={pending || disabled}
        onClick={() => setConfirming(true)}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-destructive hover:text-destructive"
      aria-label={label}
      disabled={pending || disabled}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
