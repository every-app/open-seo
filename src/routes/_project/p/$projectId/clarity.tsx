import { createFileRoute } from "@tanstack/react-router";
import { ClarityInsightsPage } from "@/client/features/clarity/ClarityInsightsPage";

export const Route = createFileRoute("/_project/p/$projectId/clarity")({
  component: ClarityInsightsRoute,
});

function ClarityInsightsRoute() {
  const { projectId } = Route.useParams();
  return <ClarityInsightsPage projectId={projectId} />;
}
