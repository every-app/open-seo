import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { DomainFavicon } from "@/client/features/ai-visibility/DomainFavicon";
import { projectContextQueryKey } from "@/client/features/projects/project-context/shared";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { getProjectContext } from "@/serverFunctions/projectContext";

const MAX_COMPETITORS = 3;

// Props for the caller's clickable element, as in RecentSearches.
type ClickableProps = { className: string; children: ReactNode };

/**
 * The project's website and its saved competitors as one-click lookups, for a
 * search page nobody has searched on yet. Renders nothing when the project has
 * neither.
 */
export function SuggestedSites({
  projectId,
  renderLink,
}: {
  projectId: string;
  renderLink: (domain: string, props: ClickableProps) => ReactNode;
}) {
  const projectsQuery = useQuery(projectsQueryOptions());
  const contextQuery = useQuery({
    queryKey: projectContextQueryKey(projectId),
    queryFn: () => getProjectContext({ data: { projectId } }),
  });
  const ownDomain = projectsQuery.data?.find(
    (project) => project.id === projectId,
  )?.domain;
  const sites = [
    ...(ownDomain ? [{ domain: ownDomain, note: "Your website" }] : []),
    ...(contextQuery.data?.competitors ?? [])
      .slice(0, MAX_COMPETITORS)
      .map((competitor) => ({ domain: competitor.domain, note: "Competitor" })),
  ];
  if (sites.length === 0) return null;

  return (
    <ul className="grid w-full gap-2 text-left">
      {sites.map((site) => (
        <li key={site.domain}>
          {renderLink(site.domain, {
            className:
              "group flex w-full min-w-0 items-center gap-3 rounded-lg text-left border border-border px-3 py-2.5 transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50",
            children: (
              <>
                <DomainFavicon domain={site.domain} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {site.domain}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {site.note}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  aria-hidden
                />
              </>
            ),
          })}
        </li>
      ))}
    </ul>
  );
}
