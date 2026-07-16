import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/catalog")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "issues" });
  },
});
