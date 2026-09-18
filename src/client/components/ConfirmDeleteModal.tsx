import { Loader2 } from "lucide-react";
import { Modal } from "@/client/components/Modal";

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
      <h3 id="confirm-delete-title" className="text-lg font-semibold">
        {title}
      </h3>
      <p className="text-sm text-base-content/70">{detail}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-error btn-sm gap-1"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
