import type { BacklinksTab } from "@/types/schemas/backlinks";
import type {
  BacklinksOverviewData,
  BacklinksRow,
  GroupedBacklinkDomain,
} from "./backlinksPageTypes";

export const TAB_DESCRIPTIONS: Record<BacklinksTab, string> = {
  backlinks:
    "See the individual links pointing to your target, including source page, anchor text, and link quality signals.",
  domains:
    "View the unique domains linking to your target, grouped at the site level instead of by individual link.",
  pages:
    "See which pages on the target site attract the most backlinks and referring domains.",
};

export function buildSummaryStats(data: BacklinksOverviewData | undefined) {
  if (!data) return [];

  return [
    {
      label: "Backlinks",
      value: formatNumber(data.summary.backlinks),
      description: "Total links pointing to this site or page.",
    },
    {
      label: "Referring Domains",
      value: formatNumber(data.summary.referringDomains),
      description: "Unique domains linking to this site or page.",
    },
    {
      label: "Referring Pages",
      value: formatNumber(data.summary.referringPages),
      description: "Unique pages linking to this site or page.",
    },
    {
      label: "Rank",
      value: formatNumber(data.summary.rank),
      description: "DataForSEO's 0-100 authority score.",
    },
    {
      label: "Backlink Spam Score",
      value: formatDecimal(data.summary.backlinksSpamScore),
      description: "Estimated spam risk of links pointing here.",
    },
    {
      label: "Broken Backlinks",
      value: formatNumber(data.summary.brokenBacklinks),
      description: "Links pointing to broken pages here.",
    },
    {
      label: "Broken Pages",
      value: formatNumber(data.summary.brokenPages),
      description: "Broken pages here that still have backlinks.",
    },
    {
      label: "Target Spam Score",
      value: formatDecimal(data.summary.targetSpamScore),
      description: "Estimated spam risk of this site or page.",
    },
  ];
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function formatTooltipValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return "-";
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatFullDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export function formatRelativeTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function groupBacklinksByDomain(
  rows: BacklinksRow[],
): GroupedBacklinkDomain[] {
  const groups = new Map<string, BacklinksRow[]>();

  for (const row of rows) {
    const key = row.domainFrom?.replace(/^www\./, "") ?? "unknown";
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return Array.from(groups.entries()).map(([domain, children]) => ({
    domain,
    domainAuthority: maxNullable(children.map((r) => r.domainFromRank)),
    spamScore: maxNullable(children.map((r) => r.spamScore)),
    firstSeen: minDateString(children.map((r) => r.firstSeen)),
    backlinkCount: children.reduce(
      (total, child) => total + getBacklinkCount(child),
      0,
    ),
    targetCount: new Set(children.map((r) => r.urlTo).filter(Boolean)).size,
    lostCount: children.filter((r) => r.isLost).length,
    brokenCount: children.filter((r) => r.isBroken).length,
    nofollowCount: children.filter((r) => r.isDofollow === false).length,
    subRows: children.map((child) => ({
      domain: child.domainFrom?.replace(/^www\./, "") ?? "unknown",
      domainAuthority: child.domainFromRank,
      spamScore: child.spamScore,
      firstSeen: child.firstSeen,
      backlinkCount: 1,
      targetCount: 1,
      lostCount: child.isLost ? 1 : 0,
      brokenCount: child.isBroken ? 1 : 0,
      nofollowCount: child.isDofollow === false ? 1 : 0,
      subRows: [],
      _backlink: child,
    })),
  }));
}

function getBacklinkCount(row: BacklinksRow) {
  return row.linksCount != null && row.linksCount > 0 ? row.linksCount : 1;
}

function maxNullable(values: (number | null)[]): number | null {
  let result: number | null = null;
  for (const v of values) {
    if (v != null && (result == null || v > result)) result = v;
  }
  return result;
}

function minDateString(values: (string | null)[]): string | null {
  let result: string | null = null;
  for (const v of values) {
    if (v && (result == null || v < result)) result = v;
  }
  return result;
}

export function extractUrlPath(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url;
  }
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const sideLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, sideLength)}...${value.slice(-sideLength)}`;
}
