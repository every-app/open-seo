import { createFileRoute } from "@tanstack/react-router";
import { ProjectContextPage } from "@/client/features/projects/project-context/ProjectContextPage";

export const Route = createFileRoute("/_project/p/$projectId/settings/context")(
  {
    component: ProjectContextRoute,
  },
);

function ProjectContextRoute() {
  const { projectId } = Route.useParams();
  return <ProjectContextPage projectId={projectId} />;
}
