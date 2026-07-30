import { createFileRoute } from "@tanstack/react-router";
import { StructuredDataPage } from "@/client/features/structured-data/StructuredDataPage";

export const Route = createFileRoute("/_project/p/$projectId/structured-data")({
  component: StructuredDataRoute,
});

function StructuredDataRoute() {
  const { projectId } = Route.useParams();
  return <StructuredDataPage projectId={projectId} />;
}
