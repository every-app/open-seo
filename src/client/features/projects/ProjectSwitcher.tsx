import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { findLast } from "remeda";
import {
  Check,
  ChevronsUpDown,
  FolderCog,
  Plus,
  Search,
  Settings,
} from "@/client/components/icons";
import { getProjects } from "@/serverFunctions/projects";
import { setLastProjectId } from "@/client/lib/active-project";
import { CreateProjectModal } from "@/client/features/projects/CreateProjectModal";
import type { ProjectSummary } from "./types";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { InputGroup } from "@/client/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover";

import { Input } from "@/client/components/ui/input";

// Below this many projects the plain list is faster to scan than a search box.
const SEARCH_THRESHOLD = 8;

export function ProjectSwitcher({
  activeProjectId,
  onCloseDrawer,
}: {
  activeProjectId: string | null;
  // Mobile sidebar passes this so switching / navigating away also closes the
  // drawer overlay.
  onCloseDrawer?: () => void;
}) {
  // Matches are read off router.state at click time; subscribing via
  // useMatches() would re-render the whole sidebar on every route change for
  // a value only a click needs.
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  // Controlled open state: the effect below moves the caret into the search
  // box on open, which a combobox needs.
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  const showSearch = projects.length >= SEARCH_THRESHOLD;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = normalizedQuery
    ? projects.filter(
        (project) =>
          project.name.toLowerCase().includes(normalizedQuery) ||
          project.domain?.toLowerCase().includes(normalizedQuery),
      )
    : projects;

  const openPanel = () => {
    setQuery("");
    setHighlightIndex(0);
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    setQuery("");
  };

  // Opening the panel puts the caret straight in the search box, so
  // click → type → Enter selects a project with no extra step. Touch devices
  // are skipped: autofocus would pop the keyboard over the list.
  React.useEffect(() => {
    if (!open || !showSearch) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    searchInputRef.current?.focus();
  }, [open, showSearch]);

  const handleSelect = (project: ProjectSummary) => {
    closePanel();
    onCloseDrawer?.();
    if (project.id === activeProjectId) return;
    setLastProjectId(project.id);
    // Stay on the current page in the new project: the deepest matched route
    // whose path's only dynamic segment is the project id. Deeper routes (a
    // rank tracker, an audit result) reference entities owned by the old
    // project, so they fall back to their section. Filtering on the path
    // template rather than match.params matters: the router gives every match
    // the location's full param set, so params can't tell layers apart.
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
    // Navigating by href keeps typed-route generics out of a dynamic target
    // while still running search validation; search params are deliberately
    // not carried over — filters and session ids belong to the old project.
    const template = stayable?.fullPath ?? "/p/$projectId";
    void router.navigate({
      href: template.split("$projectId").join(project.id).replace(/\/$/, ""),
    });
  };

  const moveHighlight = (delta: number) => {
    setHighlightIndex((index) => {
      const next = index + delta;
      if (next < 0) return 0;
      if (next > filteredProjects.length - 1)
        return filteredProjects.length - 1;
      return next;
    });
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const project = filteredProjects[highlightIndex] ?? filteredProjects[0];
      if (project) handleSelect(project);
    }
    // Escape is handled once at the root so it also works from the project
    // list and footer buttons.
  };

  // Type-ahead fallback on the trigger: if the user types while focus is
  // still on the trigger (touch skips autofocus; focus can also stay here
  // between open and the focus effect), open the panel and route the
  // keystroke into the search box instead of dropping it. Deliberately not
  // on the wrapper — that would also swallow keystrokes bubbling from the
  // menu items and the create-project modal rendered inside it.
  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (!showSearch) return;
    const isCharacter =
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey;
    if (isCharacter || event.key === "Backspace") {
      event.preventDefault();
      if (!open) setOpen(true);
      setQuery((current) =>
        isCharacter ? current + event.key : current.slice(0, -1),
      );
      setHighlightIndex(0);
      searchInputRef.current?.focus();
    } else if (!open && event.key === "ArrowDown") {
      event.preventDefault();
      openPanel();
    } else if (open && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      handleSearchKeyDown(event);
    }
  };

  // Keep the keyboard highlight visible while arrowing through a scrolled
  // list.
  React.useEffect(() => {
    const highlighted = listRef.current?.querySelector(
      '[data-highlighted="true"]',
    );
    highlighted?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? openPanel() : closePanel())}
    >
      {/* A pill like the Browse/Chat tabs below it, so the stacked sidebar
          controls share one shape. overflow-hidden clips the children's hover
          fills to that shape; their focus rings are inset so the clip keeps them. */}
      <PopoverAnchor className="flex w-full items-stretch overflow-hidden rounded-full border border-border bg-card">
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              ref={triggerRef}
              aria-label="Switch project"
              aria-haspopup="listbox"
              onKeyDown={handleTriggerKeyDown}
              className="h-auto min-w-0 flex-1 justify-between gap-2 whitespace-normal rounded-none py-1.5 pl-4 pr-3 text-left font-normal focus-visible:ring-inset"
            />
          }
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {activeProject?.name ?? "Select project"}
            </span>
            {activeProject?.domain ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {activeProject.domain}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        {activeProject ? (
          <Link
            to="/p/$projectId/settings"
            params={{ projectId: activeProject.id }}
            aria-label="Project settings"
            title="Project settings"
            onClick={() => {
              closePanel();
              onCloseDrawer?.();
            }}
            className={buttonVariants({
              variant: "ghost",
              size: "icon",
              className:
                "h-auto w-11 rounded-none border-l border-border pr-1 focus-visible:ring-inset",
            })}
          >
            <Settings className="size-4" />
          </Link>
        ) : null}
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--anchor-width) overflow-hidden p-0"
      >
        {showSearch ? (
          <div className="border-b border-border p-2">
            <InputGroup prefix={<Search className="size-3.5" />}>
              <Input
                ref={searchInputRef}
                type="text"
                value={query}
                placeholder="Find project…"
                aria-label="Filter projects"
                aria-controls="project-switcher-listbox"
                aria-activedescendant={
                  filteredProjects[highlightIndex]
                    ? `project-option-${filteredProjects[highlightIndex].id}`
                    : undefined
                }
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
            </InputGroup>
          </div>
        ) : null}

        {projects.length > 0 ? (
          // Long project lists scroll inside the panel; without the cap it
          // grows past the viewport and the footer becomes unreachable.
          <ul
            ref={listRef}
            id="project-switcher-listbox"
            role="listbox"
            aria-label="Projects"
            className="flex max-h-[min(60vh,21rem)] w-full flex-col gap-0.5 overflow-y-auto p-2"
          >
            {filteredProjects.map((project, index) => {
              const isActive = project.id === activeProjectId;
              const isHighlighted = showSearch && index === highlightIndex;
              return (
                <li key={project.id} role="presentation">
                  <Button
                    variant="ghost"
                    id={`project-option-${project.id}`}
                    role="option"
                    aria-selected={isActive}
                    data-highlighted={isHighlighted || undefined}
                    onClick={() => handleSelect(project)}
                    onMouseEnter={
                      showSearch ? () => setHighlightIndex(index) : undefined
                    }
                    className={`h-auto w-full justify-between px-2 py-1.5 text-left text-foreground ${
                      // bg-muted, not bg-accent: the muted domain line keeps
                      // AA contrast on it.
                      isActive || isHighlighted ? "bg-muted" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{project.name}</span>
                      {project.domain ? (
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {project.domain}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <Check className="size-4 shrink-0 text-link" />
                    ) : null}
                  </Button>
                </li>
              );
            })}
            {filteredProjects.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">
                No projects match “{query.trim()}”
              </li>
            ) : null}
          </ul>
        ) : null}

        <div
          className={`flex flex-col gap-0.5 p-2 ${
            projects.length > 0 ? "border-t border-border" : ""
          }`}
        >
          <Button
            variant="ghost"
            className="w-full justify-start px-2"
            onClick={() => {
              closePanel();
              // Deliberately leave the mobile drawer open: the modal is
              // rendered inside it, so closing the drawer would unmount the
              // modal. The drawer closes when the modal does.
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            New project
          </Button>
          <Link
            to="/projects"
            onClick={() => {
              closePanel();
              onCloseDrawer?.();
            }}
            className={buttonVariants({
              variant: "ghost",
              className: "w-full justify-start px-2",
            })}
          >
            <FolderCog className="size-4" />
            Manage projects
          </Link>
        </div>
      </PopoverContent>

      {creating ? (
        <CreateProjectModal
          onClose={() => {
            setCreating(false);
            onCloseDrawer?.();
          }}
        />
      ) : null}
    </Popover>
  );
}
