import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronsUpDown, CreditCard, Menu, User } from "lucide-react";
import {
  AppContent,
  MissingSeoSetupModal,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { getProjectNavItems } from "@/client/navigation/items";
import { getSignInHrefForLocation } from "@/lib/auth-redirect";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
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
    if (location.pathname === BILLING_ROUTE) {
      setSeoApiKeyStatusError(false);
      setIsSeoApiKeyConfigured(null);
      setShowMissingSeoApiKeyModal(false);
      return;
    }

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
  }, [location.pathname]);

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
        pathname={location.pathname}
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
  pathname,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  projectId: string | null;
  pathname: string;
  onOpenDrawer: () => void;
}) {
  const projectNavItems = projectId ? getProjectNavItems(projectId) : [];

  return (
    <div className="navbar shrink-0 gap-2 border-b border-base-300 bg-base-100">
      <div className="flex flex-none items-center md:hidden">
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
        <span className="ml-1 font-semibold text-base-content">OpenSEO</span>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        <span className="px-2 text-lg font-semibold text-base-content">
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
                      ? "border-transparent bg-primary/10 font-medium text-primary"
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

      <div className="hidden flex-none items-center gap-2 md:flex">
        <div className="flex items-center rounded-full border border-base-300 bg-base-100/70 px-1 py-1 shadow-sm">
          <div
            className="tooltip tooltip-left before:whitespace-nowrap"
            data-tip="Multiple projects coming soon"
          >
            <button
              type="button"
              className="flex h-10 cursor-default items-center gap-2 rounded-full px-3 text-left transition-colors hover:bg-base-200/80"
              aria-label="Current project"
            >
              <span className="max-w-28 truncate text-sm font-medium text-base-content">
                Default
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/35" />
            </button>
          </div>

          <HostedSessionActions />
        </div>
      </div>

      <HostedSessionActions mobileOnly />
    </div>
  );
}

function HostedSessionActions({
  mobileOnly = false,
}: {
  mobileOnly?: boolean;
}) {
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();

  if (!isHostedMode || !session?.user?.email) {
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

  const menu = (
    <div className={mobileOnly ? "ml-2 flex-none md:hidden" : "flex-none"}>
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
            <a href={BILLING_ROUTE} className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </a>
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

  if (mobileOnly) {
    return menu;
  }

  return (
    <>
      <div className="mx-1 h-6 w-px bg-base-300" />
      {menu}
    </>
  );
}
