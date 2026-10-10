import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/p/$projectId/bing-performance")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/p/$projectId/search-performance",
      params: { projectId: params.projectId },
      search: { source: "bing" },
      replace: true,
    });
  },
  component: () => null,
});
