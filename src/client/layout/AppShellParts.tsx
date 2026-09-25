import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink } from "@/client/components/icons";
import { Sidebar } from "@/client/components/Sidebar";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Sheet, SheetContent } from "@/client/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
function SeoApiStatusBanners({
  shouldShowSeoApiWarning,
  seoApiKeyStatusError,
}: {
  shouldShowSeoApiWarning: boolean;
  seoApiKeyStatusError: boolean;
}) {
  return (
    <>
      {shouldShowSeoApiWarning ? (
        <div className="shrink-0 px-4 py-2.5 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Alert variant="warning">
              <AlertTriangle className="size-4 shrink-0" />
              <AlertDescription className="text-sm">
                Setup needed: add your DataForSEO API key to use OpenSEO
                features. See the quick steps on the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="underline underline-offset-4 text-link font-medium"
                >
                  help page
                </Link>
                .
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : null}

      {seoApiKeyStatusError ? (
        <div className="shrink-0 px-4 py-2.5 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Alert variant="info">
              <AlertTriangle className="size-4 shrink-0" />
              <AlertDescription className="text-sm">
                We could not verify your DataForSEO setup. If features are not
                working, check the setup steps on the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="underline underline-offset-4 text-link font-medium"
                >
                  help page
                </Link>
                .
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MobileSidebarDrawer({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {/* The sidebar header carries its own close button, so the Sheet's
          corner one (its only direct <button> child) is hidden. */}
      <SheetContent
        side="left"
        className="w-auto max-w-none p-0 md:hidden [&>button]:hidden"
      >
        <Sidebar projectId={projectId} onNavigate={onClose} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

function MissingSeoSetupModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={isOpen}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg" showClose={false}>
        <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
          <div className="rounded-full bg-warning/20 p-2 text-warning">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-2">
            <DialogTitle>One quick setup step</DialogTitle>
            <DialogDescription>
              Add your DataForSEO API key to start using OpenSEO.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-1 gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={onClose}>
            Dismiss
          </Button>
          <Link
            {...dataforseoHelpLinkOptions}
            className={buttonVariants()}
            onClick={onClose}
          >
            Open setup guide
            <ExternalLink className="size-4" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { MissingSeoSetupModal, MobileSidebarDrawer, SeoApiStatusBanners };
