import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/local/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/p/$projectId/local/grid",
      params: { projectId: params.projectId },
      replace: true,
    });
  },
});
