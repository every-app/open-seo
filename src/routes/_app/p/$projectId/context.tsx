import { createFileRoute } from "@tanstack/react-router";
import { ProjectPageHeader } from "@/client/features/projects/ProjectPageHeader";
import { ProjectContextPage } from "@/client/features/projects/project-context/ProjectContextPage";

export const Route = createFileRoute("/_app/p/$projectId/context")({
  component: ProjectContextRoute,
});

function ProjectContextRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <ProjectPageHeader projectId={projectId} title="Context" />

        <ProjectContextPage projectId={projectId} />
      </div>
    </div>
  );
}
