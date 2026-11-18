import { createFileRoute, notFound } from "@tanstack/react-router";
import { TeamSettings } from "@/client/features/team/TeamSettings";
import { usesBetterAuthClient } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app/settings/organization")({
  // Access / no-auth self-host has no memberships or invitations — the
  // better-auth HTTP surface isn't even mounted there.
  beforeLoad: () => {
    if (!usesBetterAuthClient()) {
      throw notFound();
    }
  },
  component: TeamSettings,
});
