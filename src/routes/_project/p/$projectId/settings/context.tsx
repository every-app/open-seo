import { createFileRoute, redirect } from "@tanstack/react-router";

// Context moved out of settings to the project's AI group. Agents have already
// pasted this URL into transcripts, so it redirects rather than 404s.
export const Route = createFileRoute("/_project/p/$projectId/settings/context")(
  {
    beforeLoad: ({ params }) => {
      throw redirect({
        to: "/p/$projectId/context",
        params: { projectId: params.projectId },
        replace: true,
      });
    },
  },
);
