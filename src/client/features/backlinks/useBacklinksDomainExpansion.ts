import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getBacklinksRows } from "@/serverFunctions/backlinks";
import type { BacklinksRow, BacklinksSearchState } from "./backlinksPageTypes";

const DOMAIN_LINKS_PAGE_SIZE = 100;
const DOMAIN_LINKS_STALE_TIME_MS = 5 * 60 * 1000;

export type BacklinksDomainEntry =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: BacklinksRow[] };

export type BacklinksDomainExpansion = {
  expandedDomains: ReadonlySet<string>;
  /** One entry per expanded domain; keyed by the row's raw domainFrom. */
  entriesByDomain: Record<string, BacklinksDomainEntry>;
  toggleDomain: (domain: string) => void;
};

/**
 * Lazily loads the full link list for referring domains the user expands in
 * the one-per-domain backlinks view. Each expansion is one billed DataForSEO
 * request (capped at 100 links), cached client-side and in R2.
 */
export function useBacklinksDomainExpansion({
  projectId,
  searchState,
}: {
  projectId: string;
  searchState: BacklinksSearchState;
}): BacklinksDomainExpansion {
  const { target, scope } = searchState;
  const [expanded, setExpanded] = useState<string[]>([]);

  // Collapse everything when the lookup changes.
  useEffect(() => {
    setExpanded([]);
  }, [projectId, target, scope]);

  const queries = useQueries({
    queries: expanded.map((domain) => ({
      queryKey: [
        "backlinksDomainLinks",
        projectId,
        scope,
        target,
        domain,
      ] as const,
      staleTime: DOMAIN_LINKS_STALE_TIME_MS,
      queryFn: () =>
        getBacklinksRows({
          data: {
            projectId,
            target,
            scope,
            page: 1,
            pageSize: DOMAIN_LINKS_PAGE_SIZE,
            sortField: "rank",
            sortOrder: "desc",
            filters: { domainFrom: domain },
            mode: "as_is",
          },
        }),
    })),
  });

  const entriesByDomain = useMemo(() => {
    const map: Record<string, BacklinksDomainEntry> = {};
    expanded.forEach((domain, index) => {
      const query = queries[index];
      if (!query) return;
      map[domain] = query.data
        ? { status: "ready", rows: query.data.rows }
        : query.error
          ? { status: "error" }
          : { status: "loading" };
    });
    return map;
  }, [expanded, queries]);

  const expandedDomains = useMemo(() => new Set(expanded), [expanded]);

  const toggleDomain = useCallback((domain: string) => {
    setExpanded((current) =>
      current.includes(domain)
        ? current.filter((entry) => entry !== domain)
        : [...current, domain],
    );
  }, []);

  return { expandedDomains, entriesByDomain, toggleDomain };
}
