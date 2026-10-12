import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NavTab, NavTabs } from "@/client/components/NavTabs";
import { PageHeader } from "@/client/components/PageHeader";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

// Account-level settings, tabbed like project settings. Personal = the
// signed-in user (theme, API keys, analytics); Organization = the active org
// (team). Billing keeps its own page — it's linked from paywalls all over.
function SettingsLayout() {
  const tabs = [
    { to: "/settings" as const, label: "Personal", exact: true },
    // Self-host has no memberships — the organization tab would 404.
    ...(isHostedClientAuthMode()
      ? [{ to: "/settings/organization" as const, label: "Organization" }]
      : []),
  ];

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-4">
          <PageHeader title="Settings" />
          <NavTabs label="Settings sections">
            {tabs.map((tab) => (
              <NavTab
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact ?? false }}
              >
                {tab.label}
              </NavTab>
            ))}
          </NavTabs>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
