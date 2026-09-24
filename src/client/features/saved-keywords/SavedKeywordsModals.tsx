import { AlertCircle, Loader2 } from "@/client/components/icons";
import { Modal } from "@/client/components/Modal";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";

export function RemoveSavedKeywordsError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
