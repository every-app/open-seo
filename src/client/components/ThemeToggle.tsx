import { Moon, Sun } from "@/client/components/icons";
import { Button } from "@/client/components/ui/button";
import { useThemePreference } from "@/client/lib/theme";

function prefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// One-click light/dark switch; the full System/Light/Dark choice stays in
// the account menu and settings.
export function ThemeToggle({ className }: { className?: string }) {
  const { themePreference, setThemePreference } = useThemePreference();
  const isDark =
    themePreference === "dark" ||
    (themePreference === "system" && prefersDark());
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={className}
      onClick={() => setThemePreference(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
