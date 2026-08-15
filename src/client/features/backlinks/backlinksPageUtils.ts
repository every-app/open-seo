import type { BacklinksTab } from "@/types/schemas/backlinks";
import type { BacklinksOverviewData } from "./backlinksPageTypes";

export const TAB_DESCRIPTIONS: Record<BacklinksTab, string> = {
  backlinks: "查看指向目标的每条链接，包括来源页面、锚文本和链接质量信号。",
  domains: "按网站维度查看链接到目标的不重复域名。",
  pages: "查看目标网站中吸引反向链接和引用域名最多的页面。",
};

export function buildSummaryStats(data: BacklinksOverviewData | undefined) {
  if (!data) return [];

  return [
    {
      label: "反向链接",
      value: formatNumber(data.summary.backlinks),
      description: "指向此网站或页面的链接总数。",
    },
    {
      label: "引用域名",
      value: formatNumber(data.summary.referringDomains),
      description: "链接到此网站或页面的不重复域名数。",
    },
    {
      label: "引用页面",
      value: formatNumber(data.summary.referringPages),
      description: "链接到此网站或页面的不重复页面数。",
    },
    {
      label: "权威度",
      value: formatNumber(data.summary.rank),
      description: "DataForSEO 提供的 0 到 100 权威度分数。",
    },
    {
      label: "反向链接垃圾风险",
      value: formatDecimal(data.summary.backlinksSpamScore),
      description: "指向此处链接的预估垃圾风险。",
    },
    {
      label: "失效反向链接",
      value: formatNumber(data.summary.brokenBacklinks),
      description: "指向此处失效页面的链接。",
    },
    {
      label: "失效页面",
      value: formatNumber(data.summary.brokenPages),
      description: "此处仍有反向链接的失效页面。",
    },
    {
      label: "目标垃圾风险",
      value: formatDecimal(data.summary.targetSpamScore),
      description: "此网站或页面的预估垃圾风险。",
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

const ELLIPSIS = "...";

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= ELLIPSIS.length)
    return value.slice(0, Math.max(maxLength, 0));
  const sideLength = Math.floor((maxLength - ELLIPSIS.length) / 2);
  if (sideLength <= 0) {
    return `${value.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
  }
  return `${value.slice(0, sideLength)}${ELLIPSIS}${value.slice(-sideLength)}`;
}
