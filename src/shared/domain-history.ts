export const DOMAIN_HISTORY_MIN_DATE = "2020-10-01";
export const DOMAIN_HISTORY_MAX_DOMAINS = 5;

export type DomainHistoryPoint = {
  date: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
};

export type DomainHistorySeries = {
  domain: string;
  points: DomainHistoryPoint[];
  fetchedAt: string;
};

export type DomainHistoryResult = {
  dateFrom: string;
  dateTo: string;
  locationCode: number;
  languageCode: string;
  series: DomainHistorySeries[];
};

// DataForSEO Labs Historical Rank Overview pricing, checked 2026-09-06:
// $0.12 per task plus $0.0012 per returned month. Each domain is one task.
const DOMAIN_HISTORY_TASK_COST_USD = 0.12;
const DOMAIN_HISTORY_MONTH_COST_USD = 0.0012;

export function countInclusiveMonths(dateFrom: string, dateTo: string) {
  const [fromYear, fromMonth] = parseDateParts(dateFrom);
  const [toYear, toMonth] = parseDateParts(dateTo);
  return (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
}

export function estimateDomainHistoryCostUsd(
  domainCount: number,
  dateFrom: string,
  dateTo: string,
) {
  const months = Math.max(0, countInclusiveMonths(dateFrom, dateTo));
  return (
    domainCount *
    (DOMAIN_HISTORY_TASK_COST_USD + months * DOMAIN_HISTORY_MONTH_COST_USD)
  );
}

export function dateMonthsAgo(months: number, now = new Date()) {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  );
  return date.toISOString().slice(0, 10);
}

export function currentIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function parseDateParts(value: string): [number, number] {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}
