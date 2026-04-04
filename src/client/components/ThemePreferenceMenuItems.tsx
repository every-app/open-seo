import { Monitor, Moon, Sun } from "lucide-react";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemePreferenceMenuItems() {
  const { themePreference, setThemePreference } = useThemePreference();

  return (
    <>
      <li className="menu-title pt-2">
        <span>Theme</span>
      </li>

      <li>
        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
        >
          {THEME_OPTIONS.map((option) => {
            const isActive = option.value === themePreference;
            const Icon = option.icon;

            return (
              <div
                key={option.value}
                className="tooltip tooltip-bottom flex flex-1 before:whitespace-nowrap"
                data-tip={option.label}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={option.label}
                  className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
                    isActive
                      ? "bg-base-100 text-base-content shadow-sm"
                      : "text-base-content/50 hover:text-base-content/80"
                  }`}
                  onClick={() => setThemePreference(option.value)}
                >
                  <Icon className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </li>
    </>
  );
}
