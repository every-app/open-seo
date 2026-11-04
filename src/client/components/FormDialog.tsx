import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

/**
 * A small settings-style dialog: title, labelled rows, right-aligned actions.
 * Render it only while it is open. Escape, the close button and a backdrop
 * click call `onClose`.
 */
export function FormDialog({
  title,
  onClose,
  actions,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  actions: ReactNode;
  /** Room for side-by-side content, such as a list next to a map. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={wide ? "sm:max-w-3xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
