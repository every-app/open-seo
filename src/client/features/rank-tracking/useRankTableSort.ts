import { useEffect, useState } from "react";
import {
  comparePositions,
  type SortField,
  type SortDir,
} from "./RankTrackingTable";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";

export function useRankTableSort(
  rows: RankTrackingRow[],
  defaultField: SortField,
) {
  const [sortField, setSortField] = useState<SortField>(defaultField);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setSortField(defaultField);
  }, [defaultField]);

  const sorted = rows.toSorted((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "keyword")
      return dir * a.keyword.localeCompare(b.keyword);
    const device = sortField === "desktopPosition" ? "desktop" : "mobile";
    return dir * comparePositions(a[device].position, b[device].position);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return { sorted, sortField, sortDir, handleSort };
}
