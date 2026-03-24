import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronsUpDown, Menu, User } from "lucide-react";
import { getProjectNavItems } from "@/client/navigation/items";
import {
  AppContent,
  MissingSeoSetupModal,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { getSignInHrefForLocation } from "@/lib/auth-redirect";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";

const DATAFORSEO_HELP_PATH = "/help/dataforseo-api-key";

export function AuthenticatedAppLayout({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId?: string;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const setupModalRef = React.useRef<HTMLDivElement | null>(null);
  const [isSeoApiKeyConfigured, setIsSeoApiKeyConfigured] = React.useState<
    boolean | null
  >(null);
  const [seoApiKeyStatusError, setSeoApiKeyStatusError] = React.useState(false);
  const [showMissingSeoApiKeyModal, setShowMissingSeoApiKeyModal] =
    React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const checkSeoApiKeyStatus = async () => {
      try {
        const result = await getSeoApiKeyStatus();
        if (cancelled) return;

        setSeoApiKeyStatusError(false);
        setIsSeoApiKeyConfigured(result.configured);
        if (!result.configured) {
          setShowMissingSeoApiKeyModal(true);
        }
      } catch {
        if (cancelled) return;
        setSeoApiKeyStatusError(true);
        setIsSeoApiKeyConfigured(null);
        setShowMissingSeoApiKeyModal(false);
      }
    };

    void checkSeoApiKeyStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const shouldShowMissingSeoApiKeyModal =
    showMissingSeoApiKeyModal && location.pathname !== DATAFORSEO_HELP_PATH;

  const shouldShowSeoApiWarning =
    !seoApiKeyStatusError &&
    isSeoApiKeyConfigured === false &&
    !shouldShowMissingSeoApiKeyModal;

  React.useEffect(() => {
    if (!shouldShowMissingSeoApiKeyModal) return;

    setupModalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMissingSeoApiKeyModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shouldShowMissingSeoApiKeyModal]);

  React.useEffect(() => {
    if (!projectId) {
      setDrawerOpen(false);
    }
  }, [projectId]);

  return (
    <div className="flex h-[100dvh] flex-col bg-base-200">
      <TopNav
        drawerOpen={drawerOpen}
        projectId={projectId ?? null}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <SeoApiStatusBanners
        shouldShowSeoApiWarning={shouldShowSeoApiWarning}
        seoApiKeyStatusError={seoApiKeyStatusError}
      />

      <AppContent
        drawerOpen={drawerOpen}
        projectId={projectId ?? null}
        onCloseDrawer={() => setDrawerOpen(false)}
      >
        {children}
      </AppContent>

      <MissingSeoSetupModal
        ref={setupModalRef}
        isOpen={shouldShowMissingSeoApiKeyModal}
        onClose={() => setShowMissingSeoApiKeyModal(false)}
      />
    </div>
  );
}

function TopNav({
  drawerOpen,
  projectId,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  projectId: string | null;
  onOpenDrawer: () => void;
}) {
  const isHostedMode = isHostedClientAuthMode();
  const projectNavItems = projectId ? getProjectNavItems(projectId) : [];

  return (
    <div className="navbar bg-base-100 border-b border-base-300 shrink-0 gap-2">
      <div className="flex-none flex items-center md:hidden">
        {projectId ? (
          <button
            type="button"
            className="btn btn-square btn-ghost"
            aria-label="Toggle sidebar"
            aria-expanded={drawerOpen}
            onClick={onOpenDrawer}
          >
            <Menu className="h-6 w-6" />
          </button>
        ) : null}
        <span className="font-semibold text-base-content ml-1">OpenSEO</span>
      </div>

      <div className="hidden md:flex items-center gap-1">
        <span className="text-lg font-semibold text-base-content px-2">
          OpenSEO
        </span>
        {projectId
          ? projectNavItems.map((item) => {
              const { icon: Icon, ...linkProps } = item;
              return (
                <Link
                  key={linkProps.to}
                  {...linkProps}
                  activeOptions={{ exact: false, includeSearch: false }}
                  className="btn btn-sm gap-2 btn-ghost text-base-content/60 hover:text-base-content"
                  activeProps={{
                    className:
                      "bg-primary/10 text-primary font-medium border-transparent hover:text-primary",
                  }}
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
    const signInHref = getSignInHrefForLocation(window.location);
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign(signInHref);
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
