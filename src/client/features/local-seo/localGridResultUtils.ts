import type { LocalGridResultCell } from "@/types/schemas/local-seo";

export function summarizeLocalGridCells(cells: LocalGridResultCell[]) {
  const completed = cells.filter((cell) => cell.status === "completed");
  const visible = completed.filter((cell) => cell.targetRank !== null);
  const rankTotal = visible.reduce(
    (total, cell) => total + (cell.targetRank ?? 0),
    0,
  );
  return {
    completed: completed.length,
    visible: visible.length,
    topThree: visible.filter((cell) => (cell.targetRank ?? Infinity) <= 3)
      .length,
    visibilityPercent:
      completed.length === 0
        ? null
        : Math.round((visible.length / completed.length) * 100),
    averageVisibleRank:
      visible.length === 0 ? null : rankTotal / visible.length,
  };
}

export function localGridCellLabel(cell: LocalGridResultCell) {
  if (cell.status === "pending") return "Pending";
  if (cell.status === "failed") return "Failed";
  return cell.targetRank === null ? "Not found" : String(cell.targetRank);
}

export function localGridMarkerStyle(cell: LocalGridResultCell) {
  if (cell.status === "pending") {
    return { color: "#6b7280", label: "…", darkText: false };
  }
  if (cell.status === "failed") {
    return { color: "#dc2626", label: "!", darkText: false };
  }
  if (cell.targetRank === null) {
    return { color: "#525252", label: "—", darkText: false };
  }
  if (cell.targetRank <= 3) {
    return {
      color: "#22c55e",
      label: String(cell.targetRank),
      darkText: false,
    };
  }
  if (cell.targetRank <= 10) {
    return { color: "#84cc16", label: String(cell.targetRank), darkText: true };
  }
  if (cell.targetRank <= 20) {
    return { color: "#f59e0b", label: String(cell.targetRank), darkText: true };
  }
  return { color: "#ef4444", label: String(cell.targetRank), darkText: false };
}
