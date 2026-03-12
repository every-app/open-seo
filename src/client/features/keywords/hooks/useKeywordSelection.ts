import { useCallback, useState } from "react";

function getNextSelectionSet(
  current: Set<string>,
  allVisibleKeywords: string[],
): Set<string> {
  if (current.size === allVisibleKeywords.length) {
    return new Set();
  }

  return new Set(allVisibleKeywords);
}

export function useKeywordSelection() {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  const toggleRowSelection = useCallback((keyword: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }, []);

  const toggleAllRows = useCallback((allVisibleKeywords: string[]) => {
    setSelectedRows((prev) => getNextSelectionSet(prev, allVisibleKeywords));
  }, []);

  return {
    selectedRows,
    setSelectedRows,
    clearSelection,
    toggleRowSelection,
    toggleAllRows,
  };
}
