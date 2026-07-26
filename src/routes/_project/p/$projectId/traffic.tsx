import { createFileRoute } from "@tanstack/react-router";
import { VercelTrafficPage } from "@/client/features/vercel/VercelTrafficPage";

export const Route = createFileRoute("/_project/p/$projectId/traffic")({
  component: TrafficRoute,
});

function TrafficRoute() {
  const { projectId } = Route.useParams();
  return <VercelTrafficPage projectId={projectId} />;
}
