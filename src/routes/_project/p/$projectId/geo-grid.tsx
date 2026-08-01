import { createFileRoute } from "@tanstack/react-router";
import { GeoGridPage } from "@/client/features/geo-grid/GeoGridPage";

export const Route = createFileRoute("/_project/p/$projectId/geo-grid")({
  component: GeoGridPageRoute,
});

function GeoGridPageRoute() {
  const { projectId } = Route.useParams();
  return <GeoGridPage projectId={projectId} />;
}
