import { AlertCircle, Loader2 } from "lucide-react";
import { Modal } from "@/client/components/Modal";

import { Button } from "@/client/components/ui/button";
export function RemoveSavedKeywordsError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function DeleteSavedKeywordsModal({
  selectedCount,
  isPending,
  onClose,
  onConfirm,
}: {
  selectedCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onClose} labelledBy="delete-keywords-title">
      <h3 id="delete-keywords-title" className="text-lg font-semibold">
        Delete keywords?
      </h3>
      <p className="text-sm text-muted-foreground">
        This will permanently delete {selectedCount} saved keyword
        {selectedCount !== 1 ? "s" : ""}.
      </p>
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
          Delete {selectedCount} keyword
          {selectedCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </Modal>
  );
}
