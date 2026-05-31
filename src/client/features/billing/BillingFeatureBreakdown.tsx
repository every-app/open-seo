import { useQuery } from "@tanstack/react-query";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";
import {
  creditFeatureLabel,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import {
  getBillingUsageEvents,
  type BillingUsageEvent,
} from "@/serverFunctions/billing";

const BILLING_USAGE_FEATURE_IDS: string[] = [
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type BillingUsageEventProperties = {
  creditFeature?: unknown;
  credit_feature?: unknown;
  path?: unknown;
  paths?: unknown;
};

type BillingFeatureBreakdownRow = {
  label: string;
  usd: number;
};

type BillingUsageRange = {
  start: number;
  end: number;
};

function getLast30DayUsageRange(): BillingUsageRange {
  const end = Date.now();
  return {
    start: end - THIRTY_DAYS_MS,
    end,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPathSegmentsFromProperties(
  properties: BillingUsageEventProperties,
): string[] | null {
  const paths = properties.paths ?? properties.path;
  if (Array.isArray(paths)) {
    const stringPaths = paths.filter(
      (value): value is string => typeof value === "string",
    );
    if (
      stringPaths.length > 1 &&
      stringPaths.every((segment) => !segment.includes("/"))
    ) {
      return stringPaths;
    }

    const path = stringPaths[0];
    if (!path) return null;

    const parsedPath = parseJsonEncodedPath(path);
    return parsedPath ?? path.split("/").filter(Boolean);
  }

  if (typeof paths !== "string") return null;

  const parsedPath = parseJsonEncodedPath(paths);
  return parsedPath ?? paths.split("/").filter(Boolean);
}

function parseJsonEncodedPath(path: string): string[] | null {
  if (!path.startsWith("[")) return null;

  try {
    const parsed: unknown = JSON.parse(path);
    if (!Array.isArray(parsed)) return null;
    const stringPaths = parsed.filter(
      (value): value is string => typeof value === "string",
    );
    if (
      stringPaths.length > 1 &&
      stringPaths.every((segment) => !segment.includes("/"))
    ) {
      return stringPaths;
    }

    const firstPath = stringPaths[0];
    return firstPath ? firstPath.split("/").filter(Boolean) : null;
  } catch {
    return null;
  }
}

function getCreditFeatureFromUsageEvent(
  event: BillingUsageEvent,
): string | null {
  const properties = isRecord(event.properties) ? event.properties : {};
  const explicitFeature = properties.creditFeature ?? properties.credit_feature;
  if (typeof explicitFeature === "string" && explicitFeature.length > 0) {
    return explicitFeature;
  }

  const path = getPathSegmentsFromProperties(properties);
  return path ? mapDataforseoPathToCreditFeature(path) : null;
}

export function getBillingFeatureBreakdownRows(
  events: BillingUsageEvent[],
): BillingFeatureBreakdownRow[] {
  const creditsByLabel = new Map<string, number>();

  for (const event of events) {
    const feature = getCreditFeatureFromUsageEvent(event);
    const label = feature ? creditFeatureLabel(feature) : "Other";
    creditsByLabel.set(label, (creditsByLabel.get(label) ?? 0) + event.value);
  }

  return [...creditsByLabel.entries()]
    .map(([label, credits]) => ({
      label,
      usd: autumnSeoDataCreditsToUsd(credits),
    }))
    .filter((row) => row.usd > 0)
    .toSorted((a, b) => b.usd - a.usd);
}

export function BillingFeatureBreakdown() {
  const eventsQuery = useQuery({
    queryKey: ["billing", "usage-events", BILLING_USAGE_FEATURE_IDS, "30d"],
    queryFn: () => getBillingUsageEvents({ data: getLast30DayUsageRange() }),
    staleTime: 60_000,
  });

  const rows = getBillingFeatureBreakdownRows(eventsQuery.data ?? []);
  const total = rows.reduce((sum, row) => sum + row.usd, 0);

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Usage by feature</span>
        <span className="text-xs text-base-content/50">Last 30 days</span>
      </div>

      {eventsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-4 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-base-content/40">
          No usage recorded yet
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span>{row.label}</span>
                <span className="tabular-nums text-base-content/70">
                  ${row.usd.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                <div
                  className="h-full rounded-full bg-[#7c3aed]"
                  style={{ width: `${(row.usd / total) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
