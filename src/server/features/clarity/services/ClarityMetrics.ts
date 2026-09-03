import {
  CLARITY_URL_JOIN_KEY,
  type ClarityDataExportResponse,
} from "@/server/lib/clarityClient";
import { sort } from "remeda";

const CLARITY_PROVIDER_ROW_LIMIT = 1_000;

const frictionMetricDefinitions = [
  ["DeadClickCount", "deadClicks"],
  ["ExcessiveScroll", "excessiveScrolls"],
  ["RageClickCount", "rageClicks"],
  ["QuickbackClick", "quickBacks"],
  ["ScriptErrorCount", "scriptErrors"],
  ["ErrorClickCount", "errorClicks"],
] as const;

const overviewMetricNames = [
  ...frictionMetricDefinitions.map(([metricName]) => metricName),
  "ScrollDepth",
  "Traffic",
  "EngagementTime",
  "Browser",
  "Device",
  "OS",
  "Country",
  "PageTitle",
  "ReferrerUrl",
  "PopularPages",
] as const;
const urlMetricNames = [
  ...frictionMetricDefinitions.map(([metricName]) => metricName),
  "ScrollDepth",
  "Traffic",
  "EngagementTime",
] as const;

type ClarityRow = Record<string, unknown>;
type FrictionKey = (typeof frictionMetricDefinitions)[number][1];

type NormalizedFrictionMetric = {
  count: number | null;
  pageViews: number | null;
  sessions: number | null;
  sessionsWithMetricPercent: number | null;
  sessionsWithoutMetricPercent: number | null;
};

type NormalizedClarityPage = {
  url: string;
  privacyVariant: { index: number; count: number } | null;
  traffic: {
    sessions: number | null;
    botSessions: number | null;
    distinctUsers: number | null;
    pagesPerSession: number | null;
  };
  engagement: {
    averageActiveTimeSeconds: number | null;
    averageTotalTimeSeconds: number | null;
    activeTimePercent: number | null;
  };
  scrollDepthPercent: number | null;
  friction: Record<FrictionKey, NormalizedFrictionMetric>;
};

type NamedSessionRow = { label: string | null; sessions: number | null };

type NormalizedClarityOverview = {
  schemaVersion: 1;
  kind: "overview";
  traffic: NormalizedClarityPage["traffic"];
  engagement: NormalizedClarityPage["engagement"];
  scrollDepthPercent: number | null;
  friction: Record<FrictionKey, NormalizedFrictionMetric>;
  breakdowns: {
    browsers: NamedSessionRow[];
    devices: NamedSessionRow[];
    operatingSystems: NamedSessionRow[];
    countries: NamedSessionRow[];
    pageTitles: NamedSessionRow[];
    referrers: NamedSessionRow[];
    popularPages: Array<{ url: string; visits: number | null }>;
  };
};

type NormalizedClarityUrlInsights = {
  schemaVersion: 1;
  kind: "url";
  pages: NormalizedClarityPage[];
};

type ClarityReportCoverage = {
  rawMetricGroups: number;
  rawInformationRows: number;
  providerRowLimit: number;
  providerResponseRowLimitReached: boolean;
  providerLimitedMetricNames: string[];
  missingExpectedMetricNames: string[];
  unknownMetricNames: string[];
  duplicateMetricNames: string[];
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validatedNumber(
  row: ClarityRow | undefined,
  keys: string[],
  isValid: (value: number) => boolean,
) {
  for (const key of keys) {
    const value = finiteNumber(row?.[key]);
    if (value !== null && isValid(value)) return value;
  }
  return null;
}

function countFrom(row: ClarityRow | undefined, ...keys: string[]) {
  return validatedNumber(
    row,
    keys,
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
}

function nonNegativeFrom(row: ClarityRow | undefined, ...keys: string[]) {
  return validatedNumber(row, keys, (value) => value >= 0);
}

function percentFrom(row: ClarityRow | undefined, ...keys: string[]) {
  return validatedNumber(row, keys, (value) => value >= 0 && value <= 100);
}

function stringFrom(row: ClarityRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function activeTimePercent(
  averageActiveTimeSeconds: number | null,
  averageTotalTimeSeconds: number | null,
): number | null {
  if (
    averageActiveTimeSeconds === null ||
    averageTotalTimeSeconds === null ||
    averageTotalTimeSeconds <= 0 ||
    averageActiveTimeSeconds > averageTotalTimeSeconds
  ) {
    return null;
  }
  return (averageActiveTimeSeconds / averageTotalTimeSeconds) * 100;
}

function emptyFrictionMetric(): NormalizedFrictionMetric {
  return {
    count: null,
    pageViews: null,
    sessions: null,
    sessionsWithMetricPercent: null,
    sessionsWithoutMetricPercent: null,
  };
}

function emptyFriction(): Record<FrictionKey, NormalizedFrictionMetric> {
  return {
    deadClicks: emptyFrictionMetric(),
    excessiveScrolls: emptyFrictionMetric(),
    rageClicks: emptyFrictionMetric(),
    quickBacks: emptyFrictionMetric(),
    scriptErrors: emptyFrictionMetric(),
    errorClicks: emptyFrictionMetric(),
  };
}

function normalizeFriction(row: ClarityRow | undefined) {
  return {
    count: countFrom(row, "subTotal"),
    pageViews: countFrom(row, "pagesViews", "pageViews"),
    sessions: countFrom(row, "sessionsCount"),
    sessionsWithMetricPercent: percentFrom(row, "sessionsWithMetricPercentage"),
    sessionsWithoutMetricPercent: percentFrom(
      row,
      "sessionsWithoutMetricPercentage",
    ),
  } satisfies NormalizedFrictionMetric;
}

function metricRows(
  response: ClarityDataExportResponse,
  metricName: string,
): ClarityRow[] {
  return response
    .filter((metric) => metric.metricName === metricName)
    .flatMap((metric) => metric.information);
}

function trafficFrom(row: ClarityRow | undefined) {
  return {
    sessions: countFrom(row, "totalSessionCount"),
    botSessions: countFrom(row, "totalBotSessionCount"),
    distinctUsers: countFrom(
      row,
      "distinctUserCount",
      // Microsoft's published sample currently uses this typo.
      "distantUserCount",
    ),
    pagesPerSession: nonNegativeFrom(
      row,
      "pagesPerSessionPercentage",
      "PagesPerSessionPercentage",
    ),
  };
}

function engagementFrom(row: ClarityRow | undefined) {
  const averageActiveTimeSeconds = nonNegativeFrom(row, "activeTime");
  const averageTotalTimeSeconds = nonNegativeFrom(row, "totalTime");
  return {
    averageActiveTimeSeconds,
    averageTotalTimeSeconds,
    activeTimePercent: activeTimePercent(
      averageActiveTimeSeconds,
      averageTotalTimeSeconds,
    ),
  };
}

function namedSessionRows(
  response: ClarityDataExportResponse,
  metricName: string,
): NamedSessionRow[] {
  return metricRows(response, metricName).map((row) => ({
    label: stringFrom(row, "name"),
    sessions: countFrom(row, "sessionsCount"),
  }));
}

export function normalizeClarityOverview(
  response: ClarityDataExportResponse,
): NormalizedClarityOverview {
  const traffic = trafficFrom(metricRows(response, "Traffic")[0]);
  const engagement = engagementFrom(metricRows(response, "EngagementTime")[0]);
  const friction = emptyFriction();
  for (const [metricName, key] of frictionMetricDefinitions) {
    friction[key] = normalizeFriction(metricRows(response, metricName)[0]);
  }

  return {
    schemaVersion: 1,
    kind: "overview",
    traffic,
    engagement,
    scrollDepthPercent: percentFrom(
      metricRows(response, "ScrollDepth")[0],
      "averageScrollDepth",
    ),
    friction,
    breakdowns: {
      browsers: namedSessionRows(response, "Browser"),
      devices: namedSessionRows(response, "Device"),
      operatingSystems: namedSessionRows(response, "OS"),
      countries: namedSessionRows(response, "Country"),
      pageTitles: namedSessionRows(response, "PageTitle"),
      referrers: namedSessionRows(response, "ReferrerUrl"),
      popularPages: metricRows(response, "PopularPages").flatMap((row) => {
        const url = stringFrom(row, "url", "Url", "URL");
        return url ? [{ url, visits: countFrom(row, "visitsCount") }] : [];
      }),
    },
  };
}

function emptyPage(url: string): NormalizedClarityPage {
  return {
    url,
    privacyVariant: null,
    traffic: {
      sessions: null,
      botSessions: null,
      distinctUsers: null,
      pagesPerSession: null,
    },
    engagement: {
      averageActiveTimeSeconds: null,
      averageTotalTimeSeconds: null,
      activeTimePercent: null,
    },
    scrollDepthPercent: null,
    friction: emptyFriction(),
  };
}

export function normalizeClarityUrlInsights(
  response: ClarityDataExportResponse,
): NormalizedClarityUrlInsights {
  const pagesByJoinKey = new Map<string, NormalizedClarityPage>();
  const pageFor = (row: ClarityRow) => {
    const url = stringFrom(row, "Url", "URL", "url");
    if (!url) return null;
    const joinKey = stringFrom(row, CLARITY_URL_JOIN_KEY) ?? url;
    const existing = pagesByJoinKey.get(joinKey);
    if (existing) return existing;
    const page = emptyPage(url);
    pagesByJoinKey.set(joinKey, page);
    return page;
  };

  for (const row of metricRows(response, "Traffic")) {
    const page = pageFor(row);
    if (page) page.traffic = trafficFrom(row);
  }
  for (const row of metricRows(response, "EngagementTime")) {
    const page = pageFor(row);
    if (page) page.engagement = engagementFrom(row);
  }
  for (const row of metricRows(response, "ScrollDepth")) {
    const page = pageFor(row);
    if (page) {
      page.scrollDepthPercent = percentFrom(row, "averageScrollDepth");
    }
  }
  for (const [metricName, key] of frictionMetricDefinitions) {
    for (const row of metricRows(response, metricName)) {
      const page = pageFor(row);
      if (page) page.friction[key] = normalizeFriction(row);
    }
  }

  const variantsBySanitizedUrl = new Map<
    string,
    Array<{ joinKey: string; page: NormalizedClarityPage }>
  >();
  for (const [joinKey, page] of pagesByJoinKey) {
    const variants = variantsBySanitizedUrl.get(page.url) ?? [];
    variants.push({ joinKey, page });
    variantsBySanitizedUrl.set(page.url, variants);
  }
  for (const variants of variantsBySanitizedUrl.values()) {
    if (variants.length < 2) continue;
    variants.sort((left, right) => left.joinKey.localeCompare(right.joinKey));
    variants.forEach(({ page }, index) => {
      page.privacyVariant = { index: index + 1, count: variants.length };
    });
  }

  const pages = sort([...pagesByJoinKey.values()], (left, right) => {
    const sessionDelta =
      (right.traffic.sessions ?? -1) - (left.traffic.sessions ?? -1);
    return sessionDelta || left.url.localeCompare(right.url);
  });

  return { schemaVersion: 1, kind: "url", pages };
}

export function clarityReportCoverage(
  response: ClarityDataExportResponse,
  reportKind: "overview" | "url",
): ClarityReportCoverage {
  const expectedMetricNames =
    reportKind === "overview" ? overviewMetricNames : urlMetricNames;
  const expectedMetricNameSet = new Set<string>(expectedMetricNames);
  const actualMetricNames = response.map((metric) => metric.metricName);
  const actualMetricNameSet = new Set(actualMetricNames);
  const duplicateMetricNames = actualMetricNames.filter(
    (metricName, index) => actualMetricNames.indexOf(metricName) !== index,
  );
  const rawInformationRows = response.reduce(
    (total, metric) =>
      total +
      (metric.openSeoOriginalInformationRows ?? metric.information.length),
    0,
  );
  const providerLimitedMetricNames = response
    .filter(
      (metric) =>
        (metric.openSeoOriginalInformationRows ?? metric.information.length) >=
        CLARITY_PROVIDER_ROW_LIMIT,
    )
    .map((metric) => metric.metricName);
  return {
    rawMetricGroups: response.length,
    rawInformationRows,
    providerRowLimit: CLARITY_PROVIDER_ROW_LIMIT,
    providerResponseRowLimitReached: providerLimitedMetricNames.length > 0,
    providerLimitedMetricNames,
    missingExpectedMetricNames: expectedMetricNames.filter(
      (metricName) => !actualMetricNameSet.has(metricName),
    ),
    unknownMetricNames: actualMetricNames.filter(
      (metricName) => !expectedMetricNameSet.has(metricName),
    ),
    duplicateMetricNames: [...new Set(duplicateMetricNames)],
  };
}
