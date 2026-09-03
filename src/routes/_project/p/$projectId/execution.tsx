import { createFileRoute } from "@tanstack/react-router";
import { ContentExecutionPage } from "@/client/features/content-execution/ContentExecutionPage";

export const Route = createFileRoute("/_project/p/$projectId/execution")({
  component: ExecutionRoute,
});

function ExecutionRoute() {
  const { projectId } = Route.useParams();
  return <ContentExecutionPage projectId={projectId} />;
}
