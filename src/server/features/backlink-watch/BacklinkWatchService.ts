import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import {
  buildOpportunities,
  selectLostLinks,
  splitGainedAndSpam,
  toLink,
  topSpamDomains,
  windowStartDate,
} from "@/server/features/backlink-watch/backlinkWatchRules";
import {
  BACKLINKS_FETCH_LIMIT,
  MAX_NEW_MODE_COMPETITORS,
  OPPORTUNITY_FETCH_LIMIT,
} from "@/server/features/backlink-watch/backlinkWatchThresholds";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { DEFAULT_BACKLINKS_SPAM_THRESHOLD } from "@/types/schemas/backlinks";
import type {
  BacklinkWatchInput,
  BacklinkWatchResult,
} from "@/types/schemas/backlinkWatch";

// DataForSEO allows 20 targets in a domain intersection.
const MAX_INTERSECTION_TARGETS = 20;

type BacklinkWatchRequest = BacklinkWatchInput & {
  billing: BillingCustomerContext;
  projectId: string;
  projectDomain: string | null;
};

type Dataforseo = ReturnType<typeof createDataforseoClient>;
type SiteTarget = ReturnType<typeof normalizeBacklinksTarget>;

function startOfDayTimestamp(date: string) {
  return `${date} 00:00:00 +00:00`;
}

/** Saved competitor domains as API targets, minus duplicates and our own site. */
async function listCompetitorTargets(projectId: string, ownTarget: string) {
  const rows = await ProjectContextRepository.listCompetitors(projectId);
  const targets = new Set<string>();
  for (const row of rows) {
    try {
      targets.add(normalizeBacklinksTarget(row.domain).apiTarget);
    } catch {
      // A saved domain that doesn't parse can't be queried; skip it.
    }
  }
  targets.delete(ownTarget);
  return [...targets];
}

async function fetchOpportunities(args: {
  dataforseo: Dataforseo;
  target: SiteTarget;
  competitors: string[];
  mode: "new" | "all";
  windowStart: string;
}) {
  // Filter fields are per target position ("1.first_seen" is the first
  // competitor), so "new" needs one OR'd condition per competitor.
  const filters =
    args.mode === "new"
      ? args.competitors.flatMap((_, index) => [
          ...(index > 0 ? ["or"] : []),
          [
            `${index + 1}.first_seen`,
            ">=",
            startOfDayTimestamp(args.windowStart),
          ],
        ])
      : undefined;
  return args.dataforseo.backlinks.domainIntersection({
    targets: args.competitors,
    excludeTargets: [args.target.apiTarget],
    filters,
    limit: OPPORTUNITY_FETCH_LIMIT,
  });
}

async function getChanges(
  input: BacklinkWatchRequest,
): Promise<BacklinkWatchResult> {
  if (!input.projectDomain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This project has no domain. Set one before running backlink watch.",
    );
  }

  const target = normalizeBacklinksTarget(input.projectDomain);
  const now = new Date();
  const windowStart = windowStartDate(now, input.sinceDays);
  const spamThreshold = DEFAULT_BACKLINKS_SPAM_THRESHOLD;
  const dataforseo = createDataforseoClient(input.billing);
  const notes: string[] = [];

  let competitors =
    input.opportunities === "off"
      ? []
      : await listCompetitorTargets(input.projectId, target.apiTarget);
  const competitorLimit =
    input.opportunities === "new"
      ? MAX_NEW_MODE_COMPETITORS
      : MAX_INTERSECTION_TARGETS;
  if (competitors.length > competitorLimit) {
    notes.push(
      `Only the first ${competitorLimit} saved competitors were checked for opportunities (DataForSEO's filter limit).`,
    );
    competitors = competitors.slice(0, competitorLimit);
  }

  const [gainedResponse, lostResponse, opportunityResult] = await Promise.all([
    // Every link first seen in the window, spam included. The spam split
    // happens in code, so one request gives both the gains and the spam count.
    dataforseo.backlinks.rows({
      target: target.apiTarget,
      includeSubdomains: target.includeSubdomains,
      limit: BACKLINKS_FETCH_LIMIT,
      orderBy: ["domain_from_rank,desc"],
      filters: [["first_seen", ">=", startOfDayTimestamp(windowStart)]],
      mode: "one_per_domain",
      hideSpam: false,
    }),
    // DataForSEO rejected order_by and filters on a lost request, so this is
    // the first page unsorted and the window is applied in code.
    dataforseo.backlinks.rows({
      target: target.apiTarget,
      includeSubdomains: target.includeSubdomains,
      statusType: "lost",
      limit: BACKLINKS_FETCH_LIMIT,
      orderBy: [],
      mode: "as_is",
      hideSpam: false,
    }),
    input.opportunities !== "off" && competitors.length > 0
      ? fetchOpportunities({
          dataforseo,
          target,
          competitors,
          mode: input.opportunities,
          windowStart,
        }).catch((error: unknown) => ({ error }))
      : null,
  ]);

  const { gained, spam } = splitGainedAndSpam(
    gainedResponse.items.map(toLink),
    { windowStart, spamThreshold },
  );
  const spamCountIsLowerBound =
    gainedResponse.totalCount !== null &&
    gainedResponse.totalCount > gainedResponse.items.length;
  if (spamCountIsLowerBound) {
    notes.push(
      `More than ${BACKLINKS_FETCH_LIMIT} links were first seen in the window. Only the ${BACKLINKS_FETCH_LIMIT} from the highest-ranked domains were checked, so gained and spam counts are lower bounds.`,
    );
  }

  const lost = selectLostLinks(lostResponse.items.map(toLink), {
    windowStart,
    importantMinDomainRank: input.importantMinDomainRank,
    spamThreshold,
  });
  if (
    lostResponse.totalCount !== null &&
    lostResponse.totalCount > lostResponse.items.length
  ) {
    notes.push(
      `DataForSEO can't sort or date-filter lost links, so only the first ${lostResponse.items.length} of ${lostResponse.totalCount} lost links were checked. Some links lost in the window may be missing.`,
    );
  }

  let opportunities: BacklinkWatchResult["opportunities"] = [];
  if (opportunityResult && !Array.isArray(opportunityResult)) {
    const reason =
      opportunityResult.error instanceof Error
        ? opportunityResult.error.message
        : "unknown error";
    notes.push(`Competitor opportunities are unavailable: ${reason}`);
  } else if (input.opportunities !== "off") {
    const built = buildOpportunities({
      competitors,
      items: opportunityResult ?? [],
      spamThreshold,
    });
    opportunities = built.opportunities;
    notes.push(...built.notes);
  }

  return {
    domain: target.apiTarget,
    window: {
      startDate: windowStart,
      endDate: now.toISOString().slice(0, 10),
      sinceDays: input.sinceDays,
    },
    spamThreshold,
    importantMinDomainRank: input.importantMinDomainRank,
    summary: {
      gainedCount: gained.length,
      lostCount: lost.length,
      importantLostCount: lost.filter((link) => link.important).length,
      opportunityCount: opportunities.length,
      spamCount: spam.length,
      spamCountIsLowerBound,
    },
    gained: gained.slice(0, input.maxRows),
    lost: lost.slice(0, input.maxRows),
    opportunities: opportunities.slice(0, input.maxRows),
    spam: { topDomains: topSpamDomains(spam) },
    competitors,
    notes,
  };
}

export const BacklinkWatchService = { getChanges } as const;
