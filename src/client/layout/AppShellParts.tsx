import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AppBanner } from "@/client/layout/AppBanner";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { Button } from "@/client/components/ui/button";
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
  const icon = <AlertTriangle className="size-4 shrink-0" />;
  const helpLink = (
    <Link
      {...dataforseoHelpLinkOptions}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      help page
    </Link>
  );
  return (
    <>
      {shouldShowSeoApiWarning ? (
        <AppBanner variant="warning" icon={icon}>
          {isEveryAppClientAuthMode() ? (
            <>
              DataForSEO isn&apos;t set up on your Every App gateway yet. An
              owner or admin sets it with{" "}
              <code>pnpm everyapp secret set DATAFORSEO_API_KEY</code>. Steps on
              the {helpLink}.
            </>
          ) : (
            <>
              Setup needed: add your DataForSEO API key to use OpenSEO features.
              See the quick steps on the {helpLink}.
            </>
          )}
        </AppBanner>
      ) : null}

      {seoApiKeyStatusError ? (
        <AppBanner variant="info" icon={icon}>
          We could not verify your DataForSEO setup. If features are not
          working, check the setup steps on the {helpLink}.
        </AppBanner>
      ) : null}
    </>
  );
}

function MissingSeoSetupModal({ onClose }: { onClose: () => void }) {
  const everyApp = isEveryAppClientAuthMode();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-start gap-3 text-left">
          <div className="rounded-full bg-warning/20 p-2 text-warning">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-2">
            <DialogTitle>
              {everyApp
                ? "DataForSEO isn't set up yet"
                : "One quick setup step"}
            </DialogTitle>
            <DialogDescription>
              {everyApp ? (
                <>
                  Keyword, domain, backlink and rank data comes from DataForSEO
                  through your Every App gateway. An owner or admin sets it once
                  for every app with{" "}
                  <code>pnpm everyapp secret set DATAFORSEO_API_KEY</code>; the
                  setup guide has the steps.
                </>
              ) : (
                "Add your DataForSEO API key to start using OpenSEO."
              )}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Dismiss
          </Button>
          <Button
            nativeButton={false}
            render={<Link {...dataforseoHelpLinkOptions} onClick={onClose} />}
          >
            Open setup guide
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { MissingSeoSetupModal, SeoApiStatusBanners };
