import { Link } from "@tanstack/react-router";
import { Settings, User } from "lucide-react";
import { ThemePreferenceDropdownItems } from "@/client/components/ThemePreferenceMenuItems";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { signOutAndRedirect } from "@/lib/auth-client";

// Shared account menu for onboarding and standalone plan pages.
export function PlanPageAccountMenu({ email }: { email: string | undefined }) {
  if (!email) return null;

  return (
    <div className="fixed top-4 right-4 z-20">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open account menu"
            />
          }
        >
          <User className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate" data-ph-mask>
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/settings" />}>
            <Settings className="size-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ThemePreferenceDropdownItems />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => signOutAndRedirect()}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
