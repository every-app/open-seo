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
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
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

import { Button } from "@/client/components/ui/button";
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
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onClose}
            className="size-8"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        ) : null}
      </SidebarHeader>

      <div className="px-3 pb-1 pt-3">
        <ProjectSwitcher
          activeProjectId={projectId}
          onCloseDrawer={onNavigate}
        />
      </div>

      {projectId ? (
        // Atelier Tabs, the same control as the in-page tab strips.
        <div className="px-3 pb-1">
          <Tabs
            value={view}
            onValueChange={(value) =>
              value === "chat" ? openChat() : openBrowse()
            }
          >
            <TabsList>
              <TabsTrigger value="browse" className="gap-1.5">
                <LayoutGrid className="size-4" />
                Browse
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1.5">
                <MessageCircle className="size-4" />
                Chat
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarItem
                aria-label="Open account menu"
                icon={<User className="size-4" />}
              />
            }
          >
            <span data-ph-mask>{email}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            {organizations.length > 1 ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-1.5">
                    <ArrowLeftRight className="size-3" />
                    Organization
                  </DropdownMenuLabel>
                  {organizations.map((organization) => (
                    <DropdownMenuItem
                      key={organization.organizationId}
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
                        <Check className="ml-auto size-4 shrink-0" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              render={<Link to="/settings" onClick={onNavigate} />}
            >
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            {isHostedMode ? (
              <DropdownMenuItem
                render={<Link to={BILLING_ROUTE} onClick={onNavigate} />}
              >
                <CreditCard className="size-4" />
                Billing
              </DropdownMenuItem>
            ) : null}
            <ThemePreferenceMenuItems />
            {isHostedMode ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => signOutAndRedirect()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
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
