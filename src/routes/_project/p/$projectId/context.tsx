import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProjectContextPage } from "@/client/features/projects/project-context/ProjectContextPage";
import { getProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/_project/p/$projectId/context")({
  component: ProjectContextRoute,
});

function ProjectContextRoute() {
  const { projectId } = Route.useParams();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 p-4 py-8 pb-24 sm:p-6 md:py-12 md:pb-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Context</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project?.name ?? " "}
          </p>
        </div>

        <ProjectContextPage projectId={projectId} />
      </div>
    </div>
  );
}
