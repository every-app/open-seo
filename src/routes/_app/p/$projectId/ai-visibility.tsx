import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { AiResearchSetupGate } from "@/client/features/ai-visibility/AiResearchSetupGate";
import { PROMPT_RESEARCH_DESCRIPTION } from "@/client/features/ai-visibility/PromptResearchPage";
import { PROMPT_TRACKING_DESCRIPTION } from "@/client/features/ai-visibility/PromptTrackingPage";
import {
  aiResearchSetupQueryOptions,
  aiTrackerQueryOptions,
} from "@/client/features/ai-visibility/shared";
import { ProjectWebsiteGate } from "@/client/features/projects/ProjectWebsiteGate";
import { queryClient } from "@/client/tanstack-db/queryClient";

export const Route = createFileRoute("/_app/p/$projectId/ai-visibility")({
  // The setup gate below mounts only after the website gate, and each page
  // here only after setup. Start setup and the tracker every page reads
  // together on link intent and on a full load, without holding up navigation.
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      aiResearchSetupQueryOptions(params.projectId),
    );
    void queryClient.prefetchQuery(aiTrackerQueryOptions(params.projectId));
  },
  component: AiVisibilityLayout,
});

function AiVisibilityLayout() {
  const { projectId } = Route.useParams();
  const matchRoute = useMatchRoute();
  // The setup screens show the title of the page that opened them, so Prompt
  // Research and Prompt Tracking read apart before setup is done.
  const header = matchRoute({ to: "/p/$projectId/ai-visibility/research" }) ? (
    <PageHeader
      title="Prompt Research"
      description={PROMPT_RESEARCH_DESCRIPTION}
    />
  ) : (
    <PageHeader
      title="Prompt Tracking"
      description={PROMPT_TRACKING_DESCRIPTION}
    />
  );
  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-5" key={projectId}>
        <ProjectWebsiteGate projectId={projectId} header={header}>
          <AiResearchSetupGate projectId={projectId} header={header}>
            <Outlet />
          </AiResearchSetupGate>
        </ProjectWebsiteGate>
      </div>
    </div>
  );
}
