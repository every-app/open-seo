import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Sidebar } from "@/client/components/Sidebar";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";

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
            <div className="alert alert-warning">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="text-sm">
                Setup needed: add your DataForSEO API key to use OpenSEO
                features. See the quick steps on the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="link link-primary font-medium"
                >
                  help page
                </Link>
                .
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {seoApiKeyStatusError ? (
        <div className="shrink-0 px-4 py-2.5 md:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="alert alert-info">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="text-sm">
                We could not verify your DataForSEO setup. If features are not
                working, check the setup steps on the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="link link-primary font-medium"
                >
                  help page
                </Link>
                .
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AppContent({
  drawerOpen,
  projectId,
  onCloseDrawer,
  children,
}: {
  drawerOpen: boolean;
  projectId: string | null;
  onCloseDrawer: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex-1 min-h-0 md:hidden">
        <div className="h-full overflow-auto">{children}</div>

        {drawerOpen && projectId ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-black/45"
              onClick={onCloseDrawer}
            />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar
                projectId={projectId}
                onNavigate={onCloseDrawer}
                onClose={onCloseDrawer}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden md:block flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </>
  );
}

const MissingSeoSetupModal = React.forwardRef<
  HTMLDivElement,
  {
    isOpen: boolean;
    onClose: () => void;
  }
>(({ isOpen, onClose }, ref) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataforseo-setup-title"
        aria-describedby="dataforseo-setup-description"
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-base-300 bg-base-100 p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-warning/20 p-2 text-warning">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-2">
            <h2
              id="dataforseo-setup-title"
              className="text-lg font-semibold text-base-content"
            >
              One quick setup step
            </h2>
            <p
              id="dataforseo-setup-description"
              className="text-sm text-base-content/75"
            >
              Add your DataForSEO API key to start using OpenSEO.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Dismiss
          </button>
          <Link
            {...dataforseoHelpLinkOptions}
            className="btn btn-primary"
            onClick={onClose}
          >
            Open setup guide
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
});

MissingSeoSetupModal.displayName = "MissingSeoSetupModal";

export { AppContent, MissingSeoSetupModal, SeoApiStatusBanners };
