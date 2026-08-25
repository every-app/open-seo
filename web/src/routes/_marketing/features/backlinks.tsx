import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/features/backlinks")({
  beforeLoad: () => {
    throw redirect({ to: "/features/backlink-checker", statusCode: 301 });
  },
});
