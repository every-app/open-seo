import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  CircleHelp,
  CreditCard,
  FolderCog,
  Menu,
  Settings,
  User,
} from "lucide-react";
import {
  AppContent,
  MissingSeoSetupModal,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { GscReEngagementModal } from "@/client/features/gsc/GscReEngagementModal";
import {
  getProjectNavGroups,
  projectSettingsLinkOptions,
} from "@/client/navigation/items";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";
import { getProjects } from "@/serverFunctions/projects";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import { getLastProjectId } from "@/client/lib/active-project";

const DATAFORSEO_HELP_PATH = "/help/dataforseo-api-key";
const SUPPORT_PATH = "/support";

export function AuthenticatedAppLayout({
  children,
  projectId,
  banner,
}: {
  children: React.ReactNode;
  projectId?: string;
  banner?: React.ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const setupModalRef = React.useRef<HTMLDivElement | null>(null);
  const [showMissingSeoApiKeyModal, setShowMissingSeoApiKeyModal] =
    React.useState(false);
  // On non-project pages (e.g. /settings) there's no projectId in the URL, so
  // derive one for the nav/switcher: prefer the last-visited project, else the
  // most recent. Reading localStorage in an effect keeps SSR/first render stable.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    enabled: !projectId,
  });
  const [rememberedProjectId, setRememberedProjectId] = React.useState<
    string | null
  >(null);
  React.useEffect(() => {
    setRememberedProjectId(getLastProjectId());
  }, []);
  const fallbackProjects = projectsQuery.data ?? [];
  const fallbackProjectId =
    fallbackProjects.find((project) => project.id === rememberedProjectId)
      ?.id ??
    fallbackProjects[0]?.id ??
    null;
  const headerProjectId = projectId ?? fallbackProjectId;
  const shouldCheckSeoApiKeyStatus = location.pathname !== BILLING_ROUTE;
  const seoApiKeyStatusQuery = useQuery({
    queryKey: ["seoApiKeyStatus"],
    queryFn: () => getSeoApiKeyStatus(),
    enabled: shouldCheckSeoApiKeyStatus,
  });
  const isSeoApiKeyConfigured = shouldCheckSeoApiKeyStatus
    ? (seoApiKeyStatusQuery.data?.configured ?? null)
    : null;
  const seoApiKeyStatusError =
    shouldCheckSeoApiKeyStatus && seoApiKeyStatusQuery.isError;

  React.useEffect(() => {
    if (!shouldCheckSeoApiKeyStatus) {
      setShowMissingSeoApiKeyModal(false);
      return;
    }

    if (seoApiKeyStatusQuery.isError) {
      setShowMissingSeoApiKeyModal(false);
      return;
    }

    if (!seoApiKeyStatusQuery.isSuccess) return;
    setShowMissingSeoApiKeyModal(!seoApiKeyStatusQuery.data.configured);
  }, [
    location.pathname,
    seoApiKeyStatusQuery.data,
    seoApiKeyStatusQuery.isError,
    seoApiKeyStatusQuery.isSuccess,
    shouldCheckSeoApiKeyStatus,
  ]);

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
        projectId={headerProjectId}
        pathname={location.pathname}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <SeoApiStatusBanners
        shouldShowSeoApiWarning={shouldShowSeoApiWarning}
        seoApiKeyStatusError={seoApiKeyStatusError}
      />

      {banner}

      <AppContent
        drawerOpen={drawerOpen}
        projectId={headerProjectId}
        onCloseDrawer={() => setDrawerOpen(false)}
      >
        {children}
      </AppContent>

      <MissingSeoSetupModal
        ref={setupModalRef}
        isOpen={shouldShowMissingSeoApiKeyModal}
        onClose={() => setShowMissingSeoApiKeyModal(false)}
      />

      <GscReEngagementModal
        projectId={headerProjectId}
        suppressed={shouldShowMissingSeoApiKeyModal}
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
  const navGroups = projectId ? getProjectNavGroups(projectId) : [];
  const isSupportActive = pathname === SUPPORT_PATH;

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
        <Link to="/" className="ml-1 font-semibold text-base-content">
          OpenSEO
        </Link>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        <Link to="/" className="px-2 text-lg font-semibold text-base-content">
          OpenSEO
        </Link>
        {projectId
          ? navGroups.map((entry) => {
              if (entry.type === "standalone") {
                const { icon: Icon, matchSegment, ...linkProps } = entry.item;
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
                    {entry.item.label}
                  </Link>
                );
              }

              const GroupIcon = entry.icon;
              const isGroupActive = entry.matchSegments.some((seg) =>
                pathname.includes(seg),
              );

              return (
                <div key={entry.label} className="dropdown dropdown-hover">
                  <button
                    type="button"
                    tabIndex={0}
                    className={`btn btn-sm gap-1.5 ${
                      isGroupActive
                        ? "border-transparent bg-primary/10 font-medium text-primary"
                        : "btn-ghost text-base-content/60 hover:text-base-content"
                    }`}
                  >
                    <GroupIcon className="h-4 w-4" />
                    {entry.label}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                  <ul
                    tabIndex={0}
                    className="dropdown-content z-20 menu w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
                  >
                    {entry.items.map((item) => {
                      const { icon: Icon, matchSegment, ...linkProps } = item;
                      const isActive = pathname.includes(matchSegment);
                      return (
                        <li key={linkProps.to}>
                          <Link
                            {...linkProps}
                            className={
                              isActive
                                ? "bg-primary/10 font-medium text-primary"
                                : ""
                            }
                            onClick={() => {
                              if (
                                document.activeElement instanceof HTMLElement
                              ) {
                                document.activeElement.blur();
                              }
                            }}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          : null}
      </div>

      <div className="flex-1" />

      <div className="hidden flex-none items-center gap-2 md:flex">
        <div className="tooltip tooltip-bottom" data-tip="Help & Community">
          <Link
            to={SUPPORT_PATH}
            className={`btn btn-ghost btn-circle btn-sm ${
              isSupportActive
                ? "bg-primary/10 text-primary"
                : "text-base-content/60 hover:text-base-content"
            }`}
          >
            <CircleHelp className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center rounded-full border border-base-300 bg-base-100/70 px-1 py-1 shadow-sm">
          <ProjectSwitcher activeProjectId={projectId} variant="topbar" />

          <AccountMenu projectId={projectId} />
        </div>
      </div>

      <AccountMenu mobileOnly projectId={projectId} />
    </div>
  );
}

function AccountMenu({
  mobileOnly = false,
  projectId,
}: {
  mobileOnly?: boolean;
  projectId?: string | null;
}) {
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const email = session?.user?.email;

  const handleSignOut = () => signOutAndRedirect();

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
          {email ? (
            <li className="menu-title max-w-full">
              <span className="truncate text-base-content" data-ph-mask>
                {email}
              </span>
            </li>
          ) : null}
          {mobileOnly ? (
            <li>
              <Link to={SUPPORT_PATH} className="flex items-center gap-2">
                <CircleHelp className="h-4 w-4" />
                Help & Community
              </Link>
            </li>
          ) : null}
          {isHostedMode ? (
            <li>
              <Link to={BILLING_ROUTE} className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Billing
              </Link>
            </li>
          ) : null}
          {projectId ? (
            <li>
              <Link
                {...projectSettingsLinkOptions(projectId)}
                className="flex items-center gap-2"
              >
                <FolderCog className="h-4 w-4" />
                Project settings
              </Link>
            </li>
          ) : null}
          <li>
            <Link to="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </li>
          {isHostedMode && email ? (
            <li>
              <button
                type="button"
                className="text-error"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </li>
          ) : null}
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
