import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "@/client/components/icons";
import { useState } from "react";
import { toast } from "sonner";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { version } from "../../../../package.json";

import { Switch } from "@/client/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
export const Route = createFileRoute("/_app/settings/")({
  component: PersonalSettings,
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

function PersonalSettings() {
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
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Appearance
        </h2>
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm">Theme</span>
          <ToggleGroup
            aria-label="Theme preference"
            size="sm"
            value={[themePreference]}
            onValueChange={(next) => {
              const option = THEME_OPTIONS.find(
                (item) => item.value === next[0],
              );
              if (option) setThemePreference(option.value);
            }}
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                >
                  <Icon className="size-4" />
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
      </section>

      {isHosted ? (
        <>
          <ApiKeySettings />

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Analytics
            </h2>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm">Help improve OpenSEO</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Share analytics and usage data.
                </p>
              </div>
              <Switch
                checked={analyticsEnabled}
                disabled={isSessionPending || isSaving || !session?.user}
                onCheckedChange={(checked) => {
                  void updateAnalyticsPreference(checked);
                }}
                aria-label="Enable product analytics"
              />
            </div>
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">About</h2>
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">Version</span>
            <span className="font-mono text-sm text-muted-foreground">
              v{version}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
