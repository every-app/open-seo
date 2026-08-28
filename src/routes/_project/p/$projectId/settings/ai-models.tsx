import { createFileRoute } from "@tanstack/react-router";
import { AiModelSettings } from "@/client/features/ai-search/AiModelSettings";

export const Route = createFileRoute("/_project/p/$projectId/settings/ai-models")(
  {
    component: AiModelSettingsRoute,
  },
);

function AiModelSettingsRoute() {
  const { projectId } = Route.useParams();
  return <AiModelSettings projectId={projectId} />;
}
