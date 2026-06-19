import { Settings, User } from "lucide-react";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { signOutAndRedirect } from "@/lib/auth-client";

// Account dropdown shared by the onboarding wizard and the onboarding chat so a
// signed-in user can reach Settings / theme / sign out from either surface.
// Fixed top-right; renders nothing until we know the user's email.
export function OnboardingAccountMenu({
  email,
}: {
  email: string | undefined;
}) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <div className="dropdown dropdown-end">
        <button
          type="button"
          tabIndex={0}
          className="btn btn-ghost btn-circle"
          aria-label="Open account menu"
        >
          <User className="h-5 w-5" />
        </button>
        <ul
          tabIndex={0}
          className="dropdown-content z-20 menu mt-3 min-w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <li className="menu-title max-w-full">
            <span className="truncate text-base-content" data-ph-mask>
              {email}
            </span>
          </li>
          <li>
            <a href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </a>
          </li>
          <ThemePreferenceMenuItems />
          <li>
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
