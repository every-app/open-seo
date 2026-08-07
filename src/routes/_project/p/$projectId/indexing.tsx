import { createFileRoute } from "@tanstack/react-router";
import { IndexingPage } from "@/client/features/indexing/IndexingPage";

export const Route = createFileRoute("/_project/p/$projectId/indexing")({
  component: IndexingRoute,
});

function IndexingRoute() {
  const { projectId } = Route.useParams();
  return <IndexingPage projectId={projectId} />;
}
