import { createFileRoute } from "@tanstack/react-router";
import { BingPerformancePage } from "@/client/features/bing/BingPerformancePage";

export const Route = createFileRoute("/_project/p/$projectId/bing")({
  component: BingRoute,
});

function BingRoute() {
  const { projectId } = Route.useParams();
  return <BingPerformancePage projectId={projectId} />;
}
