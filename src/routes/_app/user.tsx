import { createFileRoute, Navigate } from "@tanstack/react-router";

// The parent app layout requires a session before rendering this portal entry.
export const Route = createFileRoute("/_app/user")({
  component: () => <Navigate to="/" replace />,
});
