import { useEffect, useMemo, useState } from "react";
import type { KeywordResearchDisplayRow } from "../groupSharedVolumeRows";

export const KEYWORD_RESEARCH_PAGE_SIZES = [50, 100, 300, 500] as const;
const DEFAULT_KEYWORD_RESEARCH_PAGE_SIZE = 50;
const KEYWORD_RESEARCH_PAGE_SIZE_STORAGE_KEY =
  "keyword-research-table-page-size";

type KeywordResearchPageSize = (typeof KEYWORD_RESEARCH_PAGE_SIZES)[number];

function parseKeywordResearchPageSize(value: string): KeywordResearchPageSize {
  const parsed = Number(value);
  return (
    KEYWORD_RESEARCH_PAGE_SIZES.find((size) => size === parsed) ??
    DEFAULT_KEYWORD_RESEARCH_PAGE_SIZE
  );
}

export function keywordResearchPageEnds(
  rows: KeywordResearchDisplayRow[],
  pageSize: number,
) {
  const ends: number[] = [];
  for (let start = 0; start < rows.length; ) {
    let end = Math.min(start + pageSize, rows.length);
    // Finish the last family before starting the next page.
    while (end < rows.length && rows[end].parentKeyword !== null) end++;
    ends.push(end);
    start = end;
  }
  return ends;
}

export function useKeywordResearchPagination(
  rows: KeywordResearchDisplayRow[],
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<KeywordResearchPageSize>(() =>
    getStoredKeywordResearchPageSize(),
  );
  const pageEnds = useMemo(
    () => keywordResearchPageEnds(rows, pageSize),
    [rows, pageSize],
  );
  const totalPages = Math.max(1, pageEnds.length);
  const currentPage = Math.min(page, totalPages);
  const start = pageEnds[currentPage - 2] ?? 0;
  const end = pageEnds[currentPage - 1] ?? 0;

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const pageRows = useMemo(() => rows.slice(start, end), [start, end, rows]);

  return {
    page: currentPage,
    pageRange: { start: start + 1, end, pageCount: totalPages },
    pageSize,
    pageRows,
    setPage,
    setPageSize: (nextPageSize: KeywordResearchPageSize) => {
      setPageSize(nextPageSize);
      persistKeywordResearchPageSize(nextPageSize);
      setPage(1);
    },
  };
}

function getStoredKeywordResearchPageSize(): KeywordResearchPageSize {
  if (typeof window === "undefined") return DEFAULT_KEYWORD_RESEARCH_PAGE_SIZE;
  try {
    const stored = window.localStorage.getItem(
      KEYWORD_RESEARCH_PAGE_SIZE_STORAGE_KEY,
    );
    return stored
      ? parseKeywordResearchPageSize(stored)
      : DEFAULT_KEYWORD_RESEARCH_PAGE_SIZE;
  } catch {
    return DEFAULT_KEYWORD_RESEARCH_PAGE_SIZE;
  }
}

function persistKeywordResearchPageSize(pageSize: KeywordResearchPageSize) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEYWORD_RESEARCH_PAGE_SIZE_STORAGE_KEY,
      String(pageSize),
    );
  } catch {
    // localStorage can be unavailable; keep the in-memory selection working.
  }
}
