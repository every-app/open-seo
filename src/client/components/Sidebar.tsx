import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LinkOptions } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowLeftRight,
  Check,
  CircleHelp,
  CreditCard,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Settings,
  User,
  X,
} from "lucide-react";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { switchOrganization } from "@/serverFunctions/organization";
import {
  connectNavGroup,
  getProjectNavGroups,
} from "@/client/navigation/items";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import { SamSidebarPanel } from "@/client/features/sam/SamSidebarPanel";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { closeDropdown } from "@/client/lib/dropdown";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
import {
  Sidebar as SidebarPanel,
  SidebarContent,
  SidebarFooter as SidebarPanelFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarItem,
  sidebarItemClassName,
} from "@/client/components/ui/sidebar";

interface SidebarProps {
  projectId: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
}

function SidebarNavLink({
  icon: Icon,
  label,
  onNavigate,
  linkProps,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onNavigate?: () => void;
  linkProps: LinkOptions;
}) {
  return (
    <Link
      onClick={onNavigate}
      activeOptions={{ exact: false, includeSearch: false }}
      {...linkProps}
    >
      {({ isActive }: { isActive: boolean }) => (
        <span
          className={sidebarItemClassName(
            isActive,
            isActive ? "font-medium" : undefined,
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 truncate">{label}</span>
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ projectId, onNavigate, onClose }: SidebarProps) {
  const navGroups = projectId
    ? getProjectNavGroups(projectId)
    : [connectNavGroup];
  const navigate = useNavigate();
  const location = useLocation();
  const onSamRoute = location.pathname.includes("/sam");

  // PostHog-style sidebar tabs: Browse shows the regular nav, Chat shows the
  // SAM chat history. The tab is view state (switching to Browse leaves the
  // conversation open in the content panel), but the route wins: landing on
  // /sam selects Chat, navigating anywhere else flips back to Browse.
  const [view, setView] = useState<"browse" | "chat">(
    onSamRoute ? "chat" : "browse",
  );
  useEffect(() => {
    setView(onSamRoute ? "chat" : "browse");
  }, [onSamRoute]);

  const openChat = () => {
    setView("chat");
    if (!projectId) return;
    if (!onSamRoute) {
      void navigate({
        to: "/p/$projectId/sam",
        params: { projectId },
        search: {},
      });
      onNavigate?.();
    }
  };

  // Coming back from Chat, land on the dashboard rather than leaving the
  // conversation filling the content panel next to a Browse nav.
  const openBrowse = () => {
    setView("browse");
    if (!projectId || !onSamRoute) return;
    void navigate({ to: "/p/$projectId", params: { projectId } });
    onNavigate?.();
  };

  return (
    <SidebarPanel aria-label="Main navigation">
      <SidebarHeader className="justify-between">
        <Link
          to="/"
          onClick={onNavigate}
          className="text-base font-semibold tracking-tight text-foreground"
        >
          OpenSEO
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </SidebarHeader>

      <div className="px-3 pb-1 pt-3">
        <ProjectSwitcher
          activeProjectId={projectId}
          onCloseDrawer={onNavigate}
        />
      </div>

      {projectId ? (
        // Same underline tab idiom as the in-page tab strips (e.g. Domain
        // Overview's Top Keywords / Top Pages).
        <div className="px-3 pb-1">
          <div role="tablist" className="tabs tabs-border w-full">
            <SidebarViewTab
              icon={LayoutGrid}
              label="Browse"
              active={view === "browse"}
              onClick={openBrowse}
            />
            <SidebarViewTab
              icon={MessageCircle}
              label="Chat"
              active={view === "chat"}
              onClick={openChat}
            />
          </div>
        </div>
      ) : null}

      {view === "chat" && projectId ? (
        <SamSidebarPanel projectId={projectId} onNavigate={onNavigate} />
      ) : (
        <SidebarContent className="min-h-0">
          <nav aria-label="Project tools">
            {navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                {group.items.map((item) => {
                  const { icon, label, ...linkProps } = item;
                  return (
                    <SidebarNavLink
                      key={linkProps.to}
                      icon={icon}
                      label={label}
                      onNavigate={onNavigate}
                      linkProps={linkProps}
                    />
                  );
                })}
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
      )}

      <SidebarFooter onNavigate={onNavigate} />
    </SidebarPanel>
  );
}

function SidebarViewTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`tab flex-1 gap-1.5 ${active ? "tab-active" : ""}`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const email = session?.user?.email;
  const [isSwitching, setIsSwitching] = useState(false);

  const orgContextQuery = useQuery({
    ...organizationContextQueryOptions(),
    enabled: isHostedMode && Boolean(email),
  });
  const organizations = orgContextQuery.data?.organizations ?? [];
  const activeOrganizationId = orgContextQuery.data?.organizationId;

  const closeMenu = () => {
    closeDropdown();
    onNavigate?.();
  };

  async function handleSwitchOrganization(organizationId: string) {
    if (isSwitching || organizationId === activeOrganizationId) return;
    setIsSwitching(true);
    try {
      await switchOrganization({ data: { organizationId } });
      // Full reload: every cached query and the project-scoped URL belong to
      // the previous organization.
      window.location.assign("/");
    } catch {
      setIsSwitching(false);
    }
  }

  return (
    <SidebarPanelFooter className="shrink-0 px-2 py-2 pb-safe">
      <SidebarNavLink
        icon={CircleHelp}
        label="Help & Community"
        onNavigate={onNavigate}
        linkProps={{ to: "/support" }}
      />

      {email ? (
        <div className="dropdown dropdown-top w-full">
          <SidebarItem
            tabIndex={0}
            aria-label="Open account menu"
            icon={<User className="size-4" />}
          >
            <span data-ph-mask>{email}</span>
          </SidebarItem>
          <ul
            tabIndex={0}
            className="dropdown-content z-30 menu mb-1 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
          >
            {organizations.length > 1 ? (
              <>
                <li className="menu-title flex flex-row items-center gap-1.5 max-w-full">
                  <ArrowLeftRight className="h-3 w-3" />
                  Organization
                </li>
                {organizations.map((organization) => (
                  <li key={organization.organizationId}>
                    <button
                      type="button"
                      disabled={isSwitching}
                      onClick={() =>
                        void handleSwitchOrganization(
                          organization.organizationId,
                        )
                      }
                    >
                      <span className="truncate">
                        {organization.organizationName}
                      </span>
                      {organization.organizationId === activeOrganizationId ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : null}
                    </button>
                  </li>
                ))}
                <li
                  aria-hidden
                  className="pointer-events-none my-1 h-px bg-base-300 p-0"
                />
              </>
            ) : null}
            <li>
              <Link to="/settings" onClick={closeMenu}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </li>
            {isHostedMode ? (
              <li>
                <Link to={BILLING_ROUTE} onClick={closeMenu}>
                  <CreditCard className="h-4 w-4" />
                  Billing
                </Link>
              </li>
            ) : null}
            <ThemePreferenceMenuItems />
            {isHostedMode ? (
              <>
                <li
                  aria-hidden
                  className="pointer-events-none my-1 h-px bg-base-300 p-0"
                />
                <li>
                  <button
                    type="button"
                    className="text-error"
                    onClick={() => signOutAndRedirect()}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </li>
              </>
            ) : null}
          </ul>
        </div>
      ) : (
        <SidebarNavLink
          icon={Settings}
          label="Settings"
          onNavigate={onNavigate}
          linkProps={{ to: "/settings" }}
        />
      )}
    </SidebarPanelFooter>
  );
}
