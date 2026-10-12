import { sort } from "remeda";
import { autumnSeoDataCreditsToUsd } from "@/shared/billing";
import {
  creditFeatureLabel,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import type { BillingUsageEvent } from "@/serverFunctions/billing";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";
import { BillingUsageCard } from "@/client/features/billing/BillingUsageCard";
import { useBillingUsageEvents } from "@/client/features/billing/useBillingUsageEvents";

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

  return sort(
    [...creditsByLabel.entries()]
      .map(([label, credits]) => ({
        label,
        usd: autumnSeoDataCreditsToUsd(credits),
      }))
      .filter((row) => row.usd > 0),
    (a, b) => b.usd - a.usd,
  );
}

export function BillingFeatureBreakdown() {
  const eventsQuery = useBillingUsageEvents();

  return (
    <BillingUsageCard title="Usage by feature">
      <QueryState
        query={eventsQuery}
        errorFallback="Failed to load usage"
        loading={
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        }
      >
        {(events) => <BreakdownRows events={events} />}
      </QueryState>
    </BillingUsageCard>
  );
}

function BreakdownRows({ events }: { events: BillingUsageEvent[] }) {
  const rows = getBillingFeatureBreakdownRows(events);
  const total = rows.reduce((sum, row) => sum + row.usd, 0);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No usage recorded yet</div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted-foreground">
              ${row.usd.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#7c3aed]"
              style={{ width: `${(row.usd / total) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
