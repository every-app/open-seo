import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  FolderCog,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { getProjects } from "@/serverFunctions/projects";
import { setLastProjectId } from "@/client/lib/active-project";
import { CreateProjectModal } from "@/client/features/projects/CreateProjectModal";
import type { ProjectSummary } from "./types";

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
  // Controlled open state rather than daisyUI's CSS focus-within dropdown:
  // focus-within can't guarantee the search input ends up focused on open
  // (Safari never focuses buttons on click, and moving focus into the panel
  // is exactly what a combobox needs).
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
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
    const stayable = router.state.matches.findLast(
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

  // Escape closes the panel from anywhere inside the switcher — trigger,
  // search box, project list, or footer. When the create-project modal is up
  // the panel is already closed, so this never swallows the modal's own
  // Escape handling.
  const handleRootKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    closePanel();
    triggerRef.current?.focus();
  };

  // Close on clicks outside the switcher. Focus loss alone isn't used for
  // this (clicking a non-focusable spot inside the panel blurs to <body>),
  // so pointerdown containment is the single source of truth for "outside".
  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) {
        closePanel();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Also close when keyboard focus tabs out of the switcher entirely.
  const handleRootBlur = (event: React.FocusEvent) => {
    if (!open) return;
    const next = event.relatedTarget;
    if (next instanceof Node && !rootRef.current?.contains(next)) closePanel();
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
    <div
      ref={rootRef}
      onBlur={handleRootBlur}
      onKeyDown={handleRootKeyDown}
      // Hand-rolled positioning instead of daisyUI's .dropdown: its CSS also
      // shows the panel on :focus-within, which fights the controlled `open`
      // state (e.g. the panel would stay visible after closing while the
      // trigger still has focus).
      className="relative w-full"
    >
      <div className="flex items-stretch rounded-lg border border-base-300 bg-base-100">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Switch project"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => (open ? closePanel() : openPanel())}
          onKeyDown={handleTriggerKeyDown}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg px-3 py-1.5 text-left transition-colors hover:bg-base-200"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-base-content">
              {activeProject?.name ?? "Select project"}
            </span>
            {activeProject?.domain ? (
              <span className="truncate text-xs font-normal text-base-content/50">
                {activeProject.domain}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/40" />
        </button>
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
            className="flex shrink-0 items-center justify-center rounded-r-lg border-l border-base-300 px-2.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
          >
            <Settings className="size-4" />
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg">
          {showSearch ? (
            <div className="border-b border-base-300 p-2">
              <label className="input input-sm w-full">
                <Search className="size-3.5 shrink-0 text-base-content/40" />
                <input
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
                  className="grow"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlightIndex(0);
                  }}
                  onKeyDown={handleSearchKeyDown}
                />
              </label>
            </div>
          ) : null}

          {projects.length > 0 ? (
            // Long project lists scroll inside the dropdown; without the cap the
            // menu grows past the viewport and the footer becomes unreachable.
            // flex-nowrap because daisyUI menus wrap into columns by default.
            <ul
              ref={listRef}
              id="project-switcher-listbox"
              role="listbox"
              aria-label="Projects"
              className="menu max-h-[min(60vh,21rem)] w-full flex-nowrap overflow-y-auto p-2"
            >
              {filteredProjects.map((project, index) => {
                const isActive = project.id === activeProjectId;
                const isHighlighted = showSearch && index === highlightIndex;
                return (
                  <li key={project.id} role="presentation">
                    <button
                      type="button"
                      id={`project-option-${project.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-highlighted={isHighlighted || undefined}
                      onClick={() => handleSelect(project)}
                      onMouseEnter={
                        showSearch ? () => setHighlightIndex(index) : undefined
                      }
                      className={
                        isActive ? "active" : isHighlighted ? "bg-base-200" : ""
                      }
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{project.name}</span>
                        {project.domain ? (
                          <span className="truncate text-xs text-base-content/50">
                            {project.domain}
                          </span>
                        ) : null}
                      </span>
                      {isActive ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {filteredProjects.length === 0 ? (
                <li className="menu-disabled">
                  <span className="text-base-content/50">
                    No projects match “{query.trim()}”
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <ul
            className={`menu w-full shrink-0 p-2 ${
              projects.length > 0 ? "border-t border-base-300" : ""
            }`}
          >
            <li>
              <button
                type="button"
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
              </button>
            </li>
            <li>
              <Link
                to="/projects"
                onClick={() => {
                  closePanel();
                  onCloseDrawer?.();
                }}
              >
                <FolderCog className="size-4" />
                Manage projects
              </Link>
            </li>
          </ul>
        </div>
      ) : null}

      {creating ? (
        <CreateProjectModal
          onClose={() => {
            setCreating(false);
            onCloseDrawer?.();
          }}
        />
      ) : null}
    </div>
  );
}
