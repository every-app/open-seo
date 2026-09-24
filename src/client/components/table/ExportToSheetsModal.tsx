import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { Check, ExternalLink } from "@/client/components/icons";
import { Modal } from "@/client/components/Modal";
import {
  closeExportToSheetsModal,
  openGoogleSheetsTab,
  useExportToSheetsModalState,
} from "@/client/lib/exportToSheets";

import { Button } from "@/client/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

export function ExportToSheetsModal() {
  const state = useExportToSheetsModalState();
  // Close any stale modal when the user navigates away mid-flow. Deps must
  // be `[pathname]` only — adding `isOpen` would close the modal the instant
  // it opens (the effect would fire on the open->true transition).
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    closeExportToSheetsModal();
  }, [pathname]);

  if (!state.isOpen) return null;

  const { rowCount } = state;

  const handleOpenSheet = () => {
    openGoogleSheetsTab();
    closeExportToSheetsModal();
  };

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={closeExportToSheetsModal}
      labelledBy="export-to-sheets-title"
    >
      {/* Modal renders the corner close button; pr-8 keeps the title clear of
          it, and pl-10 lines the description up under the title text. */}
      <DialogHeader className="text-left">
        <div className="flex items-center gap-2 pr-8">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-4" />
          </span>
          <DialogTitle id="export-to-sheets-title" className="text-base">
            Copied {rowCount} row{rowCount === 1 ? "" : "s"} to your clipboard
          </DialogTitle>
        </div>
        <DialogDescription className="pl-10">
          Open a new Google Sheet and paste to fill it.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          size="sm"
          type="button"
          className="gap-1.5"
          onClick={handleOpenSheet}
        >
          Open new Google Sheet
          <ExternalLink className="size-3.5" />
        </Button>
      </DialogFooter>
    </Modal>
  );
}
