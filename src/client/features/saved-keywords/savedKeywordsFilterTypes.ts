export type SavedKeywordsFilterValues = {
  include: string;
  exclude: string;
  minVol: string;
  maxVol: string;
  minCpc: string;
  maxCpc: string;
  minKd: string;
  maxKd: string;
};

export const EMPTY_SAVED_KEYWORDS_FILTERS: SavedKeywordsFilterValues = {
  include: "",
  exclude: "",
  minVol: "",
  maxVol: "",
  minCpc: "",
  maxCpc: "",
  minKd: "",
  maxKd: "",
};

export type AppliedSavedKeywordsFilters = {
  includeTerms?: string[];
  excludeTerms?: string[];
  minVolume?: number | null;
  maxVolume?: number | null;
  minCpc?: number | null;
  maxCpc?: number | null;
  minDifficulty?: number | null;
  maxDifficulty?: number | null;
};

function parseTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function clamp(value: number, bounds: { min?: number; max?: number }) {
  if (bounds.min != null && value < bounds.min) return bounds.min;
  if (bounds.max != null && value > bounds.max) return bounds.max;
  return value;
}

function toIntOrUndef(
  value: string,
  bounds: { min?: number; max?: number } = {},
): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(clamp(n, bounds));
}

function toFloatOrUndef(
  value: string,
  bounds: { min?: number; max?: number } = {},
): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return clamp(n, bounds);
}

export function compileSavedKeywordsFilters(
  values: SavedKeywordsFilterValues,
): AppliedSavedKeywordsFilters {
  const includeTerms = parseTerms(values.include);
  const excludeTerms = parseTerms(values.exclude);
  return {
    includeTerms: includeTerms.length > 0 ? includeTerms : undefined,
    excludeTerms: excludeTerms.length > 0 ? excludeTerms : undefined,
    minVolume: toIntOrUndef(values.minVol, { min: 0 }),
    maxVolume: toIntOrUndef(values.maxVol, { min: 0 }),
    minCpc: toFloatOrUndef(values.minCpc, { min: 0 }),
    maxCpc: toFloatOrUndef(values.maxCpc, { min: 0 }),
    minDifficulty: toIntOrUndef(values.minKd, { min: 0, max: 100 }),
    maxDifficulty: toIntOrUndef(values.maxKd, { min: 0, max: 100 }),
  };
}

export function countActiveSavedKeywordsFilters(
  values: SavedKeywordsFilterValues,
): number {
  return Object.values(values).filter((value) => value.trim() !== "").length;
}
