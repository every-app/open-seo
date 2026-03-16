import type { BacklinksTab } from "@/types/schemas/backlinks";
import type { BacklinksOverviewData } from "./backlinksPageTypes";

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
