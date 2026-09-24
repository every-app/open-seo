import { Loader2 } from "@/client/components/icons";
import { Modal } from "@/client/components/Modal";

import { Button } from "@/client/components/ui/button";
import { DialogDescription, DialogTitle } from "@/client/components/ui/dialog";

/** Confirm-by-name modal for a delete with no undo. */
export function ConfirmDeleteModal({
  title,
  detail,
  confirmLabel,
  isPending,
  onClose,
  onConfirm,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onClose} labelledBy="confirm-delete-title">
      <DialogTitle id="confirm-delete-title">{title}</DialogTitle>
      <DialogDescription>{detail}</DialogDescription>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          type="button"
          className="gap-1"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
