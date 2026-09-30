import type {
  PromptExplorerModel,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

/**
 * A source cited across one or more model answers, deduplicated by URL. This is
 * the scan-friendly counterpart to the per-model inline citation lists: instead
 * of "which sources did this model cite", it answers "which pages were cited,
 * and by whom".
 */
export type CitedPage = {
  url: string;
  domain: string | null;
  title: string | null;
  /** True if any model cited this URL as a brand match. */
  matchedBrand: boolean;
  /** Distinct models that cited this URL, in first-seen order. */
  models: PromptExplorerModel[];
  /** Number of distinct models that cited this URL (`models.length`). */
  citationCount: number;
};

/**
 * Aggregate per-model citations into one deduplicated list keyed by URL.
 *
 * - Error results carry no citations and are skipped.
 * - A URL cited by several models collapses to a single row whose `models`
 *   lists each distinct model once (multi-model attribution).
 * - `matchedBrand` is preserved as a logical OR: if any model flagged the URL
 *   as a brand match, the aggregated page is a brand match.
 * - `title` / `domain` take the first non-null value seen, so a later richer
 *   citation fills in what an earlier bare one left empty.
 *
 * Rows are ordered most-cited first, brand matches ahead of non-matches on a
 * tie, then by URL so the output is stable and test-friendly.
 */
export function aggregateCitedPages(
  results: PromptExplorerResult["results"],
): CitedPage[] {
  const byUrl = new Map<string, CitedPage>();

  for (const modelResult of results) {
    if (modelResult.status !== "success") continue;
    for (const citation of modelResult.citations) {
      const existing = byUrl.get(citation.url);
      if (existing) {
        if (!existing.models.includes(modelResult.model)) {
          existing.models.push(modelResult.model);
        }
        existing.matchedBrand = existing.matchedBrand || citation.matchedBrand;
        existing.title = existing.title ?? citation.title;
        existing.domain = existing.domain ?? citation.domain;
      } else {
        byUrl.set(citation.url, {
          url: citation.url,
          domain: citation.domain,
          title: citation.title,
          matchedBrand: citation.matchedBrand,
          models: [modelResult.model],
          citationCount: 0,
        });
      }
    }
  }

  const pages = [...byUrl.values()].map((page) => ({
    ...page,
    citationCount: page.models.length,
  }));

  pages.sort((a, b) => {
    if (b.citationCount !== a.citationCount) {
      return b.citationCount - a.citationCount;
    }
    if (a.matchedBrand !== b.matchedBrand) {
      return a.matchedBrand ? -1 : 1;
    }
    return a.url.localeCompare(b.url);
  });

  return pages;
}
