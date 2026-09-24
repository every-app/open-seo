import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import {
  archiveProject,
  getProjects,
  updateProject,
} from "@/serverFunctions/projects";
import type { ProjectSummary } from "./types";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Spinner } from "@/client/components/ui/spinner";
export function ProjectGeneralSettings({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];
  const project = projects.find((entry) => entry.id === projectId) ?? null;

  if (!project) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* key resets the form's local state when switching between projects */}
      <GeneralSection key={project.id} project={project} />
      <DangerSection project={project} canArchive={projects.length > 1} />
    </div>
  );
}

function GeneralSection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(project.name);
  const [domain, setDomain] = React.useState(project.domain ?? "");
  const [market, setMarket] = React.useState({
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProject({
        data: {
          projectId: project.id,
          name: name.trim(),
          domain: domain.trim() || undefined,
          ...market,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to update project")),
  });

  const isDirty =
    name.trim() !== project.name ||
    (domain.trim() || "") !== (project.domain ?? "") ||
    market.locationCode !== project.locationCode ||
    market.languageCode !== project.languageCode;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (updateMutation.isPending) return;
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground/70">General</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="w-full"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Domain <span className="text-muted-foreground/70">(optional)</span>
          </span>
          <Input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            maxLength={255}
            className="w-full"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <ProjectMarketFields value={market} onChange={setMarket} />
          <span className="text-xs text-muted-foreground/70">
            Keyword, SERP, and domain data uses this country and language unless
            a call asks for a different one.
          </span>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            type="submit"
            disabled={updateMutation.isPending || !isDirty}
          >
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

function DangerSection({
  project,
  canArchive,
}: {
  project: ProjectSummary;
  canArchive: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      if (getLastProjectId() === project.id) clearLastProjectId();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project archived");
      // Re-resolve to a remaining project via the landing redirect.
      void navigate({ to: "/" });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to archive project")),
  });

  return (
    <section className="space-y-3 border-t border-border pt-8">
      <h2 className="text-sm font-medium text-muted-foreground/70">
        Archive project
      </h2>

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Archiving{" "}
            <span className="font-medium text-foreground">{project.name}</span>{" "}
            removes it from your workspace and stops its scheduled rank
            tracking. You can restore it later from the Projects page.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              Yes, archive project
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={archiveMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {canArchive
              ? "Archive this project to remove it from your organization."
              : "You can't archive your only project."}
          </p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="text-destructive shrink-0"
            onClick={() => setConfirming(true)}
            disabled={!canArchive}
          >
            Archive project
          </Button>
        </div>
      )}
    </section>
  );
}
