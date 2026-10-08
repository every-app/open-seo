import * as React from "react";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { findLast } from "remeda";
import { FolderCog, Plus, Settings } from "lucide-react";
import { setLastProjectId } from "@/client/lib/active-project";
import { CreateProjectModal } from "@/client/features/projects/CreateProjectModal";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/client/components/ui/combobox";
import { Button } from "@/client/components/ui/button";
import { Separator } from "@/client/components/ui/separator";
import { Skeleton } from "@/client/components/ui/skeleton";
import type { ProjectSummary } from "./types";

const SEARCH_THRESHOLD = 8;

function matchesProject(project: ProjectSummary, query: string) {
  const needle = query.trim().toLowerCase();
  return (
    project.name.toLowerCase().includes(needle) ||
    Boolean(project.domain?.toLowerCase().includes(needle))
  );
}

export function ProjectSwitcher({
  activeProjectId,
  ready,
  onCloseDrawer,
}: {
  activeProjectId: string | null;
  /** The session is confirmed, so the projects list can load. */
  ready: boolean;
  onCloseDrawer?: () => void;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const projectsQuery = useQuery({ ...projectsQueryOptions(), enabled: ready });
  const projects = projectsQuery.data ?? [];
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  if (projectsQuery.isPending) {
    // The loaded switcher's box: a name line, a domain line and the settings
    // button's slot, so nothing moves when the projects arrive.
    return (
      <div
        className="flex items-stretch rounded-lg border border-sidebar-border bg-card"
        aria-busy
      >
        <div className="flex min-w-0 flex-1 flex-col px-3 py-1.5">
          <span className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-28" />
          </span>
          <span className="flex h-4 items-center">
            <Skeleton className="h-3 w-20" />
          </span>
        </div>
        <div className="w-12 border-l border-sidebar-border" />
      </div>
    );
  }

  const handleSelect = (project: ProjectSummary) => {
    setOpen(false);
    onCloseDrawer?.();
    if (project.id === activeProjectId) return;
    setLastProjectId(project.id);
    // Keep the current section when it exists in the new project. Detail
    // routes refer to entities in the old project and fall back to the section.
    const stayable = findLast(
      router.state.matches,
      (match) =>
        match.fullPath.includes("$projectId") &&
        match.fullPath
          .split("/")
          .every(
            (segment) => !segment.startsWith("$") || segment === "$projectId",
          ),
    );
    const template = stayable?.fullPath ?? "/p/$projectId";
    void router.navigate({
      href: template.split("$projectId").join(project.id).replace(/\/$/, ""),
    });
  };

  return (
    <>
      <Combobox
        items={projects}
        value={activeProject}
        itemToStringLabel={(project) => project.name}
        isItemEqualToValue={(project, value) => project.id === value.id}
        filter={matchesProject}
        defaultInputValue=""
        autoHighlight
        open={open}
        onOpenChange={setOpen}
        onValueChange={(project) => {
          if (project) handleSelect(project);
        }}
      >
        <div className="flex items-stretch rounded-lg border border-sidebar-border bg-card">
          <ComboboxTrigger
            aria-label="Switch project"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg px-3 py-1.5 text-left hover:bg-accent"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {activeProject?.name ?? "Select project"}
              </span>
              {activeProject?.domain ? (
                <span className="truncate text-xs text-muted-foreground">
                  {activeProject.domain}
                </span>
              ) : null}
            </span>
          </ComboboxTrigger>
          {activeProject ? (
            <Button
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/settings"
                  params={{ projectId: activeProject.id }}
                  aria-label="Project settings"
                  title="Project settings"
                  onClick={() => {
                    setOpen(false);
                    onCloseDrawer?.();
                  }}
                />
              }
              variant="ghost"
              className="h-auto self-stretch rounded-l-none border-0 border-l border-sidebar-border"
            >
              <Settings className="size-4" />
            </Button>
          ) : null}
        </div>
        <ComboboxContent className="w-(--anchor-width)">
          {projects.length >= SEARCH_THRESHOLD ? (
            <ComboboxInput
              className="w-auto"
              placeholder="Find project…"
              aria-label="Filter projects"
              showTrigger={false}
            />
          ) : null}
          {projects.length > 0 ? (
            <ComboboxEmpty>No projects match.</ComboboxEmpty>
          ) : null}
          <ComboboxList className="max-h-[min(60vh,21rem)]">
            {(project: ProjectSummary) => (
              <ComboboxItem key={project.id} value={project}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{project.name}</span>
                  {project.domain ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {project.domain}
                    </span>
                  ) : null}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
          <Separator />
          <div className="grid gap-0.5 p-1">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
            >
              <Plus className="size-4" />
              New project
            </Button>
            <Button
              nativeButton={false}
              render={
                <Link
                  to="/projects"
                  onClick={() => {
                    setOpen(false);
                    onCloseDrawer?.();
                  }}
                />
              }
              variant="ghost"
              className="justify-start"
            >
              <FolderCog className="size-4" />
              Manage projects
            </Button>
          </div>
        </ComboboxContent>
      </Combobox>
      {creating ? (
        <CreateProjectModal
          onClose={() => {
            setCreating(false);
            onCloseDrawer?.();
          }}
        />
      ) : null}
    </>
  );
}
