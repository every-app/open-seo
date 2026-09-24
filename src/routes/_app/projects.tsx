import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "@/client/components/icons";
import { toast } from "sonner";
import {
  getArchivedProjects,
  getProjects,
  restoreProject,
} from "@/serverFunctions/projects";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getLastProjectId } from "@/client/lib/active-project";
import { CreateProjectModal } from "@/client/features/projects/CreateProjectModal";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Spinner } from "@/client/components/ui/spinner";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const [creating, setCreating] = React.useState(false);
  // Read after mount to keep SSR/first render stable.
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    setCurrentProjectId(getLastProjectId());
  }, []);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];

  return (
    <div className="h-full overflow-auto px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project has its own Search Console, rank tracking, and
              audits.
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            className="shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            New project
          </Button>
        </div>

        {projectsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    to="/p/$projectId/settings"
                    params={{ projectId: project.id }}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {project.name}
                        </span>
                        {project.id === currentProjectId ? (
                          <Badge
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                          >
                            Current
                          </Badge>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {project.domain ?? "No domain set"}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ArchivedProjects />
      </div>

      {creating ? (
        <CreateProjectModal onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function ArchivedProjects() {
  const queryClient = useQueryClient();
  const archivedQuery = useQuery({
    queryKey: ["projects", "archived"],
    queryFn: () => getArchivedProjects(),
  });
  const archived = archivedQuery.data ?? [];

  const restoreMutation = useMutation({
    mutationFn: (projectId: string) =>
      restoreProject({ data: { archivedProjectId: projectId } }),
    onSuccess: async () => {
      // Prefix match invalidates both the active and archived lists.
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project restored");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to restore project")),
  });

  if (archived.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {archived.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-muted-foreground">
                  {project.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {project.domain ?? "No domain set"}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="shrink-0"
                onClick={() => restoreMutation.mutate(project.id)}
                disabled={restoreMutation.isPending}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
