import type { KeywordIntent } from "@/types/keywords";

export const MAX_KEYWORDS_PER_SUBMIT = 5;

export type ResultLimit = 150 | 300 | 500;
export const RESULT_LIMITS: ResultLimit[] = [150, 300, 500];

export type KeywordSource = "related" | "suggestions" | "ideas";
export type KeywordMode = "auto" | KeywordSource;
/** Actual result source; google_ads serves countries Labs doesn't cover. */
export type ResearchSource = KeywordSource | "google_ads";

export type KeywordFilterValues = {
  include: string;
  exclude: string;
  minVol: string;
  maxVol: string;
  minCpc: string;
  maxCpc: string;
  minKd: string;
  maxKd: string;
  /**
   * Selected search intents, stored as a comma-separated string (e.g.
   * "transactional,commercial") so it fits the all-strings filter shape used
   * for form state, persistence, and active-filter counting. Empty = no intent
   * filter. Use {@link parseIntentFilter} / {@link toggleIntentFilter} to read
   * and edit it rather than parsing the string ad hoc.
   */
  intents: string;
};

export const EMPTY_FILTERS: KeywordFilterValues = {
  include: "",
  exclude: "",
  minVol: "",
  maxVol: "",
  minCpc: "",
  maxCpc: "",
  minKd: "",
  maxKd: "",
  intents: "",
};

/** Canonical intent order for stable serialization and UI display. */
export const KEYWORD_INTENT_ORDER: KeywordIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
  "unknown",
];

const KEYWORD_INTENT_SET = new Set<string>(KEYWORD_INTENT_ORDER);

/** Parses the stored intents string into a list of valid, de-duplicated intents. */
export function parseIntentFilter(value: string): KeywordIntent[] {
  if (!value) return [];
  const selected = new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part): part is KeywordIntent => KEYWORD_INTENT_SET.has(part)),
  );
  // Emit in canonical order so persistence and comparisons are deterministic.
  return KEYWORD_INTENT_ORDER.filter((intent) => selected.has(intent));
}

/** Toggles one intent in the stored string, preserving canonical order. */
export function toggleIntentFilter(
  value: string,
  intent: KeywordIntent,
): string {
  const selected = new Set(parseIntentFilter(value));
  if (selected.has(intent)) {
    selected.delete(intent);
  } else {
    selected.add(intent);
  }
  return KEYWORD_INTENT_ORDER.filter((item) => selected.has(item)).join(",");
}
