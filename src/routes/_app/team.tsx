import { createFileRoute, redirect } from "@tanstack/react-router";

// The old standalone Team page moved into Settings → Organization; keep the
// URL working for bookmarks.
export const Route = createFileRoute("/_app/team")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/organization" });
  },
});
