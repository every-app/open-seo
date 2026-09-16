import { createFileRoute } from "@tanstack/react-router";
import { BingPerformancePage } from "@/client/features/bing-performance/BingPerformancePage";

export const Route = createFileRoute("/_project/p/$projectId/bing-performance")(
  {
    component: BingPerformanceRoute,
  },
);

function BingPerformanceRoute() {
  const { projectId } = Route.useParams();
  return <BingPerformancePage projectId={projectId} />;
}
