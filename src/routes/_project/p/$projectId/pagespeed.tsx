import { createFileRoute } from "@tanstack/react-router";
import { PagespeedPage } from "@/client/features/pagespeed/PagespeedPage";

export const Route = createFileRoute("/_project/p/$projectId/pagespeed")({
  component: PagespeedRoute,
});

function PagespeedRoute() {
  const { projectId } = Route.useParams();
  return <PagespeedPage projectId={projectId} />;
}
