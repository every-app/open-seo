import { Link } from "@tanstack/react-router";
import type { LinkOptions } from "@tanstack/react-router";
import type { ComponentType } from "react";
import {
  CircleHelp,
  CreditCard,
  LogOut,
  Settings,
  User,
  X,
} from "lucide-react";
import {
  connectNavGroup,
  getProjectNavGroups,
} from "@/client/navigation/items";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { closeDropdown } from "@/client/lib/dropdown";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";

interface SidebarProps {
  projectId: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
}

const navItemBaseClass =
  "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-base-content/70";

const navItemClass = `${navItemBaseClass} transition-colors hover:bg-base-300/50 hover:text-base-content`;

const navItemActiveProps = {
  className: "bg-base-300/50 font-medium text-base-content",
};

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
      {...linkProps}
      onClick={onNavigate}
      activeOptions={{ exact: false, includeSearch: false }}
      className={navItemClass}
      activeProps={navItemActiveProps}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          {isActive ? (
            <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
          ) : null}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </Link>
  );
}

export function Sidebar({ projectId, onNavigate, onClose }: SidebarProps) {
  const navGroups = [
    ...(projectId ? getProjectNavGroups(projectId) : []),
    connectNavGroup,
  ];

  return (
    <div className="flex h-full w-60 flex-col bg-base-200">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="text-base font-semibold text-base-content"
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
      </div>

      <div className="px-3 pb-1">
        <ProjectSwitcher
          activeProjectId={projectId}
          onCloseDrawer={onNavigate}
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-base-content/40">
              {group.label}
            </div>
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
          </div>
        ))}
      </nav>

      <SidebarFooter onNavigate={onNavigate} />
    </div>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const email = session?.user?.email;

  const closeMenu = () => {
    closeDropdown();
    onNavigate?.();
  };

  return (
    <div className="shrink-0 border-t border-base-300 px-2 py-2 pb-safe">
      <SidebarNavLink
        icon={CircleHelp}
        label="Help & Community"
        onNavigate={onNavigate}
        linkProps={{ to: "/support" }}
      />

      {email ? (
        <div className="dropdown dropdown-top w-full">
          <button
            type="button"
            tabIndex={0}
            className={`${navItemClass} w-full`}
            aria-label="Open account menu"
          >
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate" data-ph-mask>
              {email}
            </span>
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content z-30 menu mb-1 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
          >
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
    </div>
  );
}
