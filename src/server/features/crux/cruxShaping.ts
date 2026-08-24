import type {
  CruxDate,
  CruxHistoryRecord,
  CruxMetric,
  CruxRecord,
} from "@/server/lib/cruxClient";
import type { CruxSnapshotRecord, CruxWeeklyRow } from "@/types/schemas/crux";

// Snapshot field -> CrUX wire metric name.
const METRIC_KEYS = {
  lcpMs: "largest_contentful_paint",
  inpMs: "interaction_to_next_paint",
  cls: "cumulative_layout_shift",
  ttfbMs: "experimental_time_to_first_byte",
} as const;

/** CLS values (p75s and histogram bounds) arrive as strings on the wire;
 *  time metrics as numbers. Normalize both, dropping anything non-numeric. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const pad = (part: number) => String(part).padStart(2, "0");

function formatCruxDate(date: CruxDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function shapeMetric(
  metric: CruxMetric | undefined,
): CruxSnapshotRecord["lcpMs"] {
  const p75 = toNumber(metric?.percentiles?.p75);
  if (p75 == null) return null;
  // Histogram bins are ordered good / needs-improvement / poor.
  const density = (index: number) => metric?.histogram?.[index]?.density ?? 0;
  return {
    p75,
    good: density(0),
    needsImprovement: density(1),
    poor: density(2),
  };
}

/** Shape a `records:queryRecord` record into the cached snapshot record. */
export function shapeCruxRecord(record: CruxRecord): CruxSnapshotRecord {
  return {
    lcpMs: shapeMetric(record.metrics?.[METRIC_KEYS.lcpMs]),
    inpMs: shapeMetric(record.metrics?.[METRIC_KEYS.inpMs]),
    cls: shapeMetric(record.metrics?.[METRIC_KEYS.cls]),
    ttfbMs: shapeMetric(record.metrics?.[METRIC_KEYS.ttfbMs]),
    collectionPeriod: record.collectionPeriod
      ? {
          firstDate: formatCruxDate(record.collectionPeriod.firstDate),
          lastDate: formatCruxDate(record.collectionPeriod.lastDate),
        }
      : null,
  };
}

/** Shape a `records:queryHistoryRecord` record into weekly p75 rows. The
 *  p75s timeseries align index-for-index with `collectionPeriods`; weeks
 *  where CrUX had too few samples carry nulls. */
export function shapeCruxHistory(record: CruxHistoryRecord): CruxWeeklyRow[] {
  const p75At = (wireKey: string, index: number) =>
    toNumber(
      record.metrics?.[wireKey]?.percentilesTimeseries?.p75s?.[index] ?? null,
    );
  return (record.collectionPeriods ?? []).map((period, index) => ({
    weekEnd: formatCruxDate(period.lastDate),
    lcpMs: p75At(METRIC_KEYS.lcpMs, index),
    inpMs: p75At(METRIC_KEYS.inpMs, index),
    cls: p75At(METRIC_KEYS.cls, index),
  }));
}
