import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/client/components/ui/dialog";

// Callers mount the modal to open it and unmount it to close it, so the
// Dialog is always open here; Escape, the backdrop and the close button all
// route to onClose. Without onClose the dialog cannot be dismissed.
export function Modal({
  maxWidth = "max-w-sm",
  children,
  onClose,
  labelledBy,
}: {
  maxWidth?: string;
  children: ReactNode;
  onClose?: () => void;
  labelledBy?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        aria-labelledby={labelledBy}
        showClose={Boolean(onClose)}
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${maxWidth}`}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
