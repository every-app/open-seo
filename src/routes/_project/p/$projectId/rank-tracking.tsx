import { createFileRoute } from "@tanstack/react-router";
import { RankTrackingPage } from "@/client/features/rank-tracking/RankTrackingPage";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking")({
  component: RankTrackingRoute,
});

function RankTrackingRoute() {
  const { projectId } = Route.useParams();
  return <RankTrackingPage projectId={projectId} />;
}
