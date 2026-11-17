/* eslint-disable unicorn/no-array-sort -- the TS lib target lacks toSorted, and every sort here is on an array this module built itself */
import type {
  BacklinksItem,
  DomainIntersectionItem,
} from "@/server/lib/dataforseo";
import type {
  BacklinkWatchLink,
  BacklinkWatchLostLink,
  BacklinkWatchOpportunity,
} from "@/types/schemas/backlinkWatch";
import { TOP_SPAM_DOMAINS } from "@/server/features/backlink-watch/backlinkWatchThresholds";

// Pure functions only: no I/O, so the rules can be tested without DataForSEO.
// Dates from DataForSEO look like "2026-11-10 08:30:00 +00:00"; the first ten
// characters are the UTC date, which compares correctly as text.

export const NO_COMPETITORS_NOTE =
  "No competitors are saved for this project, so competitor opportunities were skipped. Save three to five in Project Context to enable them.";

export function toLink(item: BacklinksItem): BacklinkWatchLink {
  return {
    domainFrom: item.domain_from ?? null,
    urlFrom: item.url_from ?? null,
    urlTo: item.url_to ?? null,
    anchor: item.anchor ?? null,
    isDofollow: item.dofollow ?? null,
    domainRank: item.domain_from_rank ?? null,
    spamScore: item.backlink_spam_score ?? item.backlinks_spam_score ?? null,
    firstSeen: item.first_seen ?? null,
    lostDate: item.lost_date ?? null,
  };
}

/** First day of the window as YYYY-MM-DD (UTC): `sinceDays` days before now. */
export function windowStartDate(now: Date, sinceDays: number): string {
  const start = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

function isOnOrAfter(date: string | null, windowStart: string): boolean {
  return date !== null && date.slice(0, 10) >= windowStart;
}

// A missing score is treated as clean, matching the "<= threshold" filter the
// Backlinks page applies.
function isSpam(spamScore: number | null, spamThreshold: number): boolean {
  return spamScore !== null && spamScore > spamThreshold;
}

function byDomainRankDesc(a: { domainRank: number | null }, b: typeof a) {
  return (b.domainRank ?? -1) - (a.domainRank ?? -1);
}

/**
 * Splits links first seen in the window into real gains and spam. Spam is
 * never returned as a gain.
 */
export function splitGainedAndSpam(
  links: BacklinkWatchLink[],
  options: { windowStart: string; spamThreshold: number },
) {
  const gained: BacklinkWatchLink[] = [];
  const spam: BacklinkWatchLink[] = [];
  for (const link of links) {
    if (!isOnOrAfter(link.firstSeen, options.windowStart)) continue;
    if (isSpam(link.spamScore, options.spamThreshold)) spam.push(link);
    else gained.push(link);
  }
  return { gained: gained.sort(byDomainRankDesc), spam };
}

/** Top spam domains by spam score, one entry per domain. */
export function topSpamDomains(spam: BacklinkWatchLink[]) {
  const byDomain = new Map<string, number | null>();
  for (const link of spam) {
    if (!link.domainFrom) continue;
    const best = byDomain.get(link.domainFrom);
    if (best === undefined || (link.spamScore ?? 0) > (best ?? 0)) {
      byDomain.set(link.domainFrom, link.spamScore);
    }
  }
  return [...byDomain]
    .map(([domain, spamScore]) => ({ domain, spamScore }))
    .sort((a, b) => (b.spamScore ?? 0) - (a.spamScore ?? 0))
    .slice(0, TOP_SPAM_DOMAINS);
}

/** Dofollow, not spam, and from a domain at or above the rank threshold. */
function isImportantLostLink(
  link: BacklinkWatchLink,
  options: { importantMinDomainRank: number; spamThreshold: number },
): boolean {
  return (
    link.isDofollow === true &&
    !isSpam(link.spamScore, options.spamThreshold) &&
    link.domainRank !== null &&
    link.domainRank >= options.importantMinDomainRank
  );
}

/** Links lost in the window, important ones first, then by domain rank. */
export function selectLostLinks(
  links: BacklinkWatchLink[],
  options: {
    windowStart: string;
    importantMinDomainRank: number;
    spamThreshold: number;
  },
): BacklinkWatchLostLink[] {
  return links
    .filter((link) => isOnOrAfter(link.lostDate, options.windowStart))
    .map((link) => ({ ...link, important: isImportantLostLink(link, options) }))
    .sort(
      (a, b) =>
        Number(b.important) - Number(a.important) || byDomainRankDesc(a, b),
    );
}

/**
 * Turns intersection items into opportunities: spam removed, sites linking to
 * more competitors first, then by domain rank. `competitors` must be in the
 * same order as the request targets, because the API keys each entry by
 * position ("1" is the first competitor).
 */
export function buildOpportunities(input: {
  competitors: string[];
  items: DomainIntersectionItem[];
  spamThreshold: number;
}): { opportunities: BacklinkWatchOpportunity[]; notes: string[] } {
  if (input.competitors.length === 0) {
    return { opportunities: [], notes: [NO_COMPETITORS_NOTE] };
  }

  const opportunities: BacklinkWatchOpportunity[] = [];
  for (const item of input.items) {
    const linked = input.competitors.flatMap((competitor, index) => {
      const entry = item.domain_intersection[String(index + 1)];
      return entry ? [{ competitor, entry }] : [];
    });
    const domain = linked.find(({ entry }) => entry.target)?.entry.target;
    if (!domain) continue;

    const spamScores = linked.flatMap(({ entry }) =>
      entry.backlinks_spam_score == null ? [] : [entry.backlinks_spam_score],
    );
    const spamScore = spamScores.length > 0 ? Math.max(...spamScores) : null;
    if (isSpam(spamScore, input.spamThreshold)) continue;

    const ranks = linked.flatMap(({ entry }) =>
      entry.rank == null ? [] : [entry.rank],
    );
    const firstSeen = linked
      .flatMap(({ entry }) => (entry.first_seen ? [entry.first_seen] : []))
      .sort()
      .at(-1);
    opportunities.push({
      domain,
      competitors: linked.map(({ competitor }) => competitor),
      competitorCount: linked.length,
      domainRank: ranks.length > 0 ? Math.max(...ranks) : null,
      spamScore,
      firstSeen: firstSeen ?? null,
    });
  }

  opportunities.sort(
    (a, b) =>
      b.competitorCount - a.competitorCount ||
      (b.domainRank ?? -1) - (a.domainRank ?? -1),
  );
  return { opportunities, notes: [] };
}
