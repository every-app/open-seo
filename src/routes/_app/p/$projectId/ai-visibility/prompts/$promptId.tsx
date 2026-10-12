import { createFileRoute } from "@tanstack/react-router";
import { PromptHistoryPage } from "@/client/features/ai-visibility/PromptHistoryPage";
import { aiPromptHistoryQueryOptions } from "@/client/features/ai-visibility/shared";
import { queryClient } from "@/client/tanstack-db/queryClient";

export const Route = createFileRoute(
  "/_app/p/$projectId/ai-visibility/prompts/$promptId",
)({
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      aiPromptHistoryQueryOptions(params.projectId, params.promptId),
    );
  },
  component: AiPromptHistoryRoute,
});

function AiPromptHistoryRoute() {
  const { projectId, promptId } = Route.useParams();
  return (
    <PromptHistoryPage
      key={`${projectId}:${promptId}`}
      projectId={projectId}
      promptId={promptId}
    />
  );
}
