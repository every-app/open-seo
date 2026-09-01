import type { LocalGridResultCell } from "@/types/schemas/local-seo";

export interface LocalGridReportContext {
  businessName: string;
  address: string | null;
  centerLatitude: number;
  centerLongitude: number;
  gridSize: number;
  radiusMeters: number;
  distanceUnit: "km" | "mi";
  rating: number | null;
  reviewCount: number | null;
}

interface LocalGridReportMetrics {
  completed: number;
  failed: number;
  visible: number;
  topThree: number;
  topTen: number;
  opportunity: number;
  unranked: number;
  visibilityPercent: number;
  topThreePercent: number;
  topTenPercent: number;
  opportunityPercent: number;
  unrankedPercent: number;
  averageVisibleRank: number | null;
}

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

export function buildLocalGridReportMetrics(
  cells: LocalGridResultCell[],
): LocalGridReportMetrics {
  const completed = cells.filter((cell) => cell.status === "completed");
  const visible = completed.filter((cell) => cell.targetRank !== null);
  const topThree = visible.filter((cell) => (cell.targetRank ?? 0) <= 3);
  const topTen = visible.filter((cell) => (cell.targetRank ?? 0) <= 10);
  const opportunity = visible.filter(
    (cell) => (cell.targetRank ?? 0) >= 11 && (cell.targetRank ?? 0) <= 20,
  );
  const unranked = completed.filter((cell) => cell.targetRank === null);
  const rankTotal = visible.reduce(
    (total, cell) => total + (cell.targetRank ?? 0),
    0,
  );

  return {
    completed: completed.length,
    failed: cells.filter((cell) => cell.status === "failed").length,
    visible: visible.length,
    topThree: topThree.length,
    topTen: topTen.length,
    opportunity: opportunity.length,
    unranked: unranked.length,
    visibilityPercent: percent(visible.length, completed.length),
    topThreePercent: percent(topThree.length, completed.length),
    topTenPercent: percent(topTen.length, completed.length),
    opportunityPercent: percent(opportunity.length, completed.length),
    unrankedPercent: percent(unranked.length, completed.length),
    averageVisibleRank:
      visible.length === 0 ? null : rankTotal / visible.length,
  };
}

export function formatGridRadius(context: LocalGridReportContext) {
  const divisor = context.distanceUnit === "mi" ? 1_609.344 : 1_000;
  const value = Math.round((context.radiusMeters / divisor) * 10) / 10;
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${context.gridSize} x ${context.gridSize} (${formatted} ${context.distanceUnit} radius)`;
}

export function reportLocation(context: LocalGridReportContext) {
  return (
    context.address?.trim() ||
    `${context.centerLatitude.toFixed(5)}, ${context.centerLongitude.toFixed(5)}`
  );
}

export function reportPriority(metrics: LocalGridReportMetrics) {
  if (metrics.failed > 0) {
    return "Re-run the failed locations before using this report for client decisions.";
  }
  if (metrics.unrankedPercent >= 50) {
    return "Investigate the recurring competitors in unranked areas and compare profile relevance, reviews and location signals.";
  }
  if (metrics.topThreePercent < 40) {
    return "Focus on converting existing visibility into top-three coverage, starting with the areas where the business already ranks 4-10.";
  }
  return "Protect the strong top-three footprint and monitor the unranked edges for competitor movement.";
}
