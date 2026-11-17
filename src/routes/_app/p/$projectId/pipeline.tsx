import { createFileRoute } from "@tanstack/react-router";
import { PipelinePage } from "@/client/features/platform-seo/pipeline/PipelinePage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/pipeline")({
  head: () => pageHead("Pipeline"),
  component: PipelineRoute,
});

function PipelineRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <PipelinePage projectId={projectId} />
    </div>
  );
}
