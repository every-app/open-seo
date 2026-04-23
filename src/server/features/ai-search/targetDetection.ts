import { normalizeDomain } from "@/types/schemas/domain";

type DetectedTarget = {
  type: "domain" | "keyword";
  value: string;
};

/**
 * Decide whether free-text input is a domain (e.g. "opus.pro") or a brand
 * keyword (e.g. "Opus Clip"). Heuristic: no whitespace + contains a dot +
 * `normalizeDomain` produces a valid hostname.
 */
export function detectTarget(rawInput: string): DetectedTarget {
  const trimmed = rawInput.trim();
  const looksLikeDomain =
    trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.includes(".");

  if (looksLikeDomain) {
    try {
      const hostname = normalizeDomain(trimmed);
      if (hostname.includes(".")) {
        return { type: "domain", value: hostname };
      }
    } catch {
      // Fall through to keyword.
    }
  }

  return { type: "keyword", value: trimmed };
}
