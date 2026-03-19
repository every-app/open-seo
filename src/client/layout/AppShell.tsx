import * as React from "react";
import { Link, Outlet } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronsUpDown,
  ExternalLink,
  Menu,
  User,
} from "lucide-react";
import { Sidebar } from "@/client/components/Sidebar";
import {
  dataforseoHelpLinkOptions,
  getProjectNavItems,
} from "@/client/navigation/items";
import { getCurrentAuthRedirect } from "@/lib/auth-redirect";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export function TopNav({
  drawerOpen,
  projectId,
  pathname,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  projectId: string | null;
  pathname: string;
  onOpenDrawer: () => void;
}) {
  const isHostedMode = isHostedClientAuthMode();
  const projectNavItems = projectId ? getProjectNavItems(projectId) : [];

  return (
    <div className="navbar bg-base-100 border-b border-base-300 shrink-0 gap-2">
      <div className="flex-none flex items-center md:hidden">
        <button
          type="button"
          className="btn btn-square btn-ghost"
          aria-label="Toggle sidebar"
          aria-expanded={drawerOpen}
          onClick={onOpenDrawer}
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="font-semibold text-base-content ml-1">OpenSEO</span>
      </div>

      <div className="hidden md:flex items-center gap-1">
        <span className="text-lg font-semibold text-base-content px-2">
          OpenSEO
        </span>
        {projectId
          ? projectNavItems.map((item) => {
              const { icon: Icon, matchSegment, ...linkProps } = item;
              const isActive = pathname.includes(matchSegment);
              return (
                <Link
                  key={linkProps.to}
                  {...linkProps}
                  className={`btn btn-sm gap-2 ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium border-transparent"
                      : "btn-ghost text-base-content/60 hover:text-base-content"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })
          : null}
      </div>

      <div className="flex-1" />

      <div className="flex-none hidden md:flex items-center gap-2">
        <div className="flex items-center rounded-full border border-base-300 bg-base-100/70 px-1 py-1 shadow-sm">
          <div
            className="tooltip tooltip-left before:whitespace-nowrap"
            data-tip="Multiple projects coming soon"
          >
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full px-3 text-left transition-colors hover:bg-base-200/80 cursor-default"
              aria-label="Current project"
            >
              <span className="max-w-28 truncate text-sm font-medium text-base-content">
                Default
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/35" />
            </button>
          </div>

          {isHostedMode ? (
            <>
              <div className="mx-1 h-6 w-px bg-base-300" />
              <HostedSessionActions />
            </>
          ) : null}
        </div>
      </div>

      {isHostedMode ? <HostedSessionActions mobileOnly /> : null}
    </div>
  );
}

function HostedSessionActions({
  mobileOnly = false,
}: {
  mobileOnly?: boolean;
}) {
  const { data: session } = useSession();

  if (!session?.user?.email) {
    return null;
  }

  const handleSignOut = () => {
    const redirectTo = getCurrentAuthRedirect(window.location);
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign(
            redirectTo === "/"
              ? "/sign-in"
              : `/sign-in?redirect=${encodeURIComponent(redirectTo)}`,
          );
        },
      },
    });
  };

  return (
    <div className={mobileOnly ? "flex-none md:hidden ml-2" : "flex-none"}>
      <div className="dropdown dropdown-end">
        <button
          type="button"
          tabIndex={0}
          className={`btn btn-ghost btn-circle ${mobileOnly ? "" : "hover:bg-base-200/80"}`}
          aria-label="Open account menu"
        >
          <User className="h-5 w-5" />
        </button>
        <ul
          tabIndex={0}
          className="dropdown-content z-20 menu mt-3 min-w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <li className="menu-title max-w-full">
            <span className="truncate text-base-content">
              {session.user.email}
            </span>
          </li>
          <li>
            <button
              type="button"
              className="text-error"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function SeoApiStatusBanners({
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

export function AppContent({
  drawerOpen,
  pathname,
  projectId,
  onCloseDrawer,
}: {
  drawerOpen: boolean;
  pathname: string;
  projectId: string | null;
  onCloseDrawer: () => void;
}) {
  return (
    <>
      <div className="flex-1 min-h-0 md:hidden">
        <div className="h-full overflow-auto">
          <Outlet />
        </div>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-black/45"
              onClick={onCloseDrawer}
            />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar
                currentPath={pathname}
                projectId={projectId}
                onNavigate={onCloseDrawer}
                onClose={onCloseDrawer}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden md:block flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </>
  );
}

export const MissingSeoSetupModal = React.forwardRef<
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
