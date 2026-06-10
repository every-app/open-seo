import { useCallback, useEffect, useRef, useState } from "react";
import { chunk, unique } from "remeda";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getAhrefsDomainRatings } from "@/serverFunctions/ahrefs";

/** Map of domain (as held in table rows) → Ahrefs DR, or null when unknown. */
export type DomainRatings = Record<string, number | null>;

// The server function caps each call at 100 domains (Workers subrequest limit),
// so the client chunks larger sets and calls sequentially.
const DOMAINS_PER_REQUEST = 100;

export function useAhrefsDomainRatings(projectId: string) {
  const [ratings, setRatings] = useState<DomainRatings | null>(null);
  const ratingsRef = useRef<DomainRatings | null>(null);
  const pendingDomainsRef = useRef(new Set<string>());
  const [activeLoadCount, setActiveLoadCount] = useState(0);

  useEffect(() => {
    ratingsRef.current = ratings;
  }, [ratings]);

  const loadRatings = useCallback(
    async (domains: string[]) => {
      const currentRatings = ratingsRef.current;
      const pendingDomains = pendingDomainsRef.current;
      const targets = unique(domains.filter(Boolean)).filter(
        (domain) =>
          !Object.hasOwn(currentRatings ?? {}, domain) &&
          !pendingDomains.has(domain),
      );
      if (targets.length === 0) return;

      for (const domain of targets) pendingDomains.add(domain);
      setActiveLoadCount((count) => count + 1);
      const fetched: DomainRatings = {};
      try {
        for (const batch of chunk(targets, DOMAINS_PER_REQUEST)) {
          Object.assign(
            fetched,
            await getAhrefsDomainRatings({
              data: { projectId, domains: batch },
            }),
          );
        }
      } catch (error) {
        // Opt-in convenience feature — surface partial results, don't crash.
        toast.error(
          getStandardErrorMessage(error, "Could not load Ahrefs DR."),
        );
      } finally {
        if (Object.keys(fetched).length > 0) {
          const nextRatings = { ...ratingsRef.current, ...fetched };
          ratingsRef.current = nextRatings;
          setRatings(nextRatings);
        }
        for (const domain of targets) pendingDomains.delete(domain);
        setActiveLoadCount((count) => Math.max(0, count - 1));
      }
    },
    [projectId],
  );

  return { ratings, isLoading: activeLoadCount > 0, loadRatings };
}
