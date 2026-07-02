import { createFileRoute } from "@tanstack/react-router";
import { SearchPerformancePage } from "@/client/features/search-performance/SearchPerformancePage";

export const Route = createFileRoute(
  "/_project/p/$projectId/search-performance",
)({
  component: SearchPerformanceRoute,
});

function SearchPerformanceRoute() {
  const { projectId } = Route.useParams();
  return <SearchPerformancePage projectId={projectId} />;
}
