import { createFileRoute, notFound } from "@tanstack/react-router";
import { TeamSettings } from "@/client/features/team/TeamSettings";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app/settings/organization")({
  // Self-host has no memberships or invitations — the better-auth HTTP
  // surface isn't even mounted there.
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: TeamSettings,
});
