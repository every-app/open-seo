import { createFileRoute } from "@tanstack/react-router";
import { PromptExplorerPage } from "@/client/features/ai-search/PromptExplorerPage";

export const Route = createFileRoute("/_project/p/$projectId/prompt-explorer")({
  component: PromptExplorerRoute,
});

function PromptExplorerRoute() {
  const { projectId } = Route.useParams();
  return <PromptExplorerPage projectId={projectId} />;
}
