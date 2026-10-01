import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LinkOptions } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { appPath } from "@/shared/app-path";
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
} from "lucide-react";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { switchOrganization } from "@/serverFunctions/organization";
import {
  connectNavGroup,
  getProjectNavGroups,
} from "@/client/navigation/items";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import {
  SamChatListSkeleton,
  SamSidebarPanel,
} from "@/client/features/sam/SamSidebarPanel";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { BILLING_ROUTE } from "@/shared/billing";
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarFooter as UiSidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/client/components/ui/sidebar";
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

const navButtonClass =
  "relative text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:before:absolute data-active:before:inset-y-1 data-active:before:left-0 data-active:before:w-[3px] data-active:before:rounded-r-full data-active:before:bg-primary";

function SidebarNavLink({
  icon: Icon,
  label,
  linkProps,
  placeholder = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  linkProps: LinkOptions;
  /** Show the row without its link, while its project is still unknown. */
  placeholder?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const row = (isActive: boolean) => (
    <SidebarMenuButton
      render={<span />}
      isActive={isActive}
      aria-disabled={placeholder || undefined}
      className={navButtonClass}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </SidebarMenuButton>
  );
  return (
    <SidebarMenuItem>
      {placeholder ? (
        row(false)
      ) : (
        <Link
          {...linkProps}
          activeOptions={{
            exact: false,
            includeSearch: false,
            ...linkProps.activeOptions,
          }}
          onClick={() => setOpenMobile(false)}
        >
          {({ isActive }) => row(isActive)}
        </Link>
      )}
    </SidebarMenuItem>
  );
}

export function Sidebar({
  projectId,
  projectPending,
  ready,
}: {
  projectId: string | null;
  /** No project is known yet, but the projects list may still name one. */
  projectPending: boolean;
  /** The session is confirmed, so the sidebar's own data can load. */
  ready: boolean;
}) {
  // Until a project is known, show the project nav as rows without links, so
  // the sidebar has its full shape from the first paint instead of growing
  // once projects load. The placeholder rows never render these links.
  const navPlaceholder = projectId === null && projectPending;
  const navGroups =
    projectId !== null || navPlaceholder
      ? getProjectNavGroups(projectId ?? "")
      : [connectNavGroup];
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const onSamRoute = pathname.includes("/sam");
  const [view, setView] = useState<"browse" | "chat">(
    onSamRoute ? "chat" : "browse",
  );

  useEffect(() => {
    setView(onSamRoute ? "chat" : "browse");
  }, [onSamRoute]);

  const openChat = (activeProjectId: string) => {
    setView("chat");
    if (onSamRoute) return;
    void navigate({
      to: "/p/$projectId/sam",
      params: { projectId: activeProjectId },
      search: {},
    });
    setOpenMobile(false);
  };

  const openBrowse = (activeProjectId: string) => {
    setView("browse");
    if (!onSamRoute) return;
    void navigate({
      to: "/p/$projectId",
      params: { projectId: activeProjectId },
    });
    setOpenMobile(false);
  };

  return (
    <UiSidebar variant="inset" collapsible="offcanvas" className="md:!p-0">
      <SidebarHeader className="gap-0 px-3 pb-1 pt-3">
        <Link
          to="/"
          onClick={() => setOpenMobile(false)}
          className="px-1 pb-2 text-base font-semibold text-sidebar-foreground"
        >
          OpenSEO
        </Link>
        <ProjectSwitcher
          activeProjectId={projectId}
          ready={ready}
          onCloseDrawer={() => setOpenMobile(false)}
        />
        {projectId !== null || navPlaceholder ? (
          <Tabs
            value={view}
            onValueChange={(value) => {
              if (projectId === null) return;
              if (value === "chat") openChat(projectId);
              else openBrowse(projectId);
            }}
            className="pt-2"
          >
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="browse">
                <LayoutGrid className="size-4" />
                Browse
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-4" />
                Chat
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        {view === "chat" && projectId ? (
          ready ? (
            <SamSidebarPanel
              projectId={projectId}
              onNavigate={() => setOpenMobile(false)}
            />
          ) : (
            <div className="px-2 py-1">
              <SamChatListSkeleton />
            </div>
          )
        ) : (
          <nav
            aria-label="Main navigation"
            aria-busy={navPlaceholder || undefined}
          >
            {navGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-1">
                <SidebarGroupLabel className="h-7 uppercase tracking-wider text-sidebar-foreground/40">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const { icon, label, ...linkProps } = item;
                      return (
                        <SidebarNavLink
                          key={linkProps.to}
                          icon={icon}
                          label={label}
                          linkProps={linkProps}
                          placeholder={navPlaceholder}
                        />
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        )}
      </SidebarContent>
      <AccountFooter ready={ready} />
    </UiSidebar>
  );
}

function AccountFooter({ ready }: { ready: boolean }) {
  const { data: session } = useSession();
  const { setOpenMobile } = useSidebar();
  const email = session?.user?.email;
  const [isSwitching, setIsSwitching] = useState(false);
  const orgContextQuery = useQuery({
    ...organizationContextQueryOptions(),
    enabled: Boolean(email),
  });
  const organizations = orgContextQuery.data?.organizations ?? [];
  const activeOrganizationId = orgContextQuery.data?.organizationId;

  async function handleSwitchOrganization(organizationId: string) {
    if (isSwitching || organizationId === activeOrganizationId) return;
    setIsSwitching(true);
    try {
      await switchOrganization({ data: { organizationId } });
      window.location.assign(appPath());
    } catch (error) {
      toast.error(getStandardErrorMessage(error));
      setIsSwitching(false);
    }
  }

  return (
    <UiSidebarFooter className="gap-0 border-t border-sidebar-border pb-safe">
      <SidebarMenu>
        <SidebarNavLink
          icon={CircleHelp}
          label="Help & Community"
          linkProps={{ to: "/support" }}
        />
        {email ? (
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className={navButtonClass}
                    aria-label="Open account menu"
                  />
                }
              >
                <User className="size-4" />
                <span className="truncate" data-ph-mask>
                  {email}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
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
                          {organization.organizationId ===
                          activeOrganizationId ? (
                            <Check className="ml-auto size-4" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  render={
                    <Link to="/settings" onClick={() => setOpenMobile(false)} />
                  }
                >
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      to={BILLING_ROUTE}
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                >
                  <CreditCard className="size-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  <div className="px-1 pb-1">
                    <ThemePreferenceRadio />
                  </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOutAndRedirect()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ) : ready ? (
          <SidebarNavLink
            icon={Settings}
            label="Settings"
            linkProps={{ to: "/settings" }}
          />
        ) : (
          // The account row's slot while the session loads.
          <SidebarMenuItem>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </UiSidebarFooter>
  );
}
