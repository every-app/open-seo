import { createFileRoute } from "@tanstack/react-router";
import { RevenuePage } from "@/client/features/revenue/RevenuePage";

export const Route = createFileRoute("/_project/p/$projectId/revenue")({
  component: RevenueRoute,
});

function RevenueRoute() {
  const { projectId } = Route.useParams();
  return <RevenuePage projectId={projectId} />;
}
