import { createFileRoute, redirect } from "@tanstack/react-router";

// The old feature page ranks for "backlink checker"; that intent is now served
// by the free tool at /backlink-checker. The feature content moved to
// /features/backlinks.
export const Route = createFileRoute("/_marketing/features/backlink-checker")({
  beforeLoad: () => {
    throw redirect({ to: "/backlink-checker", statusCode: 301 });
  },
});
