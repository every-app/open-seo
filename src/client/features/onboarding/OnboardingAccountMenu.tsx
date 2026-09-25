import { Settings, User } from "@/client/components/icons";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { signOutAndRedirect } from "@/lib/auth-client";

import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
// Account dropdown for the onboarding wizard so a signed-in user can reach
// Settings / theme / sign out from it. Fixed top-right; renders nothing until
// we know the user's email.
export function OnboardingAccountMenu({
  email,
}: {
  email: string | undefined;
}) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Open account menu"
            />
          }
        >
          <User className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel
              className="truncate normal-case tracking-normal text-foreground"
              data-ph-mask
            >
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem
            render={<a href="/settings" className="flex items-center gap-2" />}
          >
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <ThemePreferenceMenuItems />
          <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
