import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function SettingsPage() {
  const isHosted = isHostedClientAuthMode();
  const { themePreference, setThemePreference } = useThemePreference();
  const { data: session, isPending: isSessionPending } = useSession();
  const [isSaving, setIsSaving] = useState(false);

  const analyticsEnabled = session?.user?.analyticsOptedOut !== true;

  async function updateAnalyticsPreference(enabled: boolean) {
    setIsSaving(true);
    try {
      const result = await authClient.updateUser({
        analyticsOptedOut: !enabled,
      });
      if (result.error) {
        toast.error("We couldn't update your analytics setting.");
      } else {
        toast.success(enabled ? "Analytics enabled" : "Analytics disabled");
      }
    } catch {
      toast.error("We couldn't update your analytics setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-xl space-y-10">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-base-content/50">
            Appearance
          </h2>
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">Theme</span>
            <div
              role="radiogroup"
              aria-label="Theme preference"
              className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
            >
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === themePreference;
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={option.label}
                    className={`flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 transition-colors ${
                      isActive
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/50 hover:text-base-content/80"
                    }`}
                    onClick={() => setThemePreference(option.value)}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {isHosted ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-base-content/50">
              Analytics
            </h2>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm">Help improve OpenSEO</p>
                <p className="mt-1 text-sm text-base-content/60">
                  Share analytics and usage data.
                </p>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={analyticsEnabled}
                disabled={isSessionPending || isSaving || !session?.user}
                onChange={(event) => {
                  void updateAnalyticsPreference(event.currentTarget.checked);
                }}
                aria-label="Enable product analytics"
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
