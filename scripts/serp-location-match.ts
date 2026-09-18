/**
 * Resolve a free-form location string ("Catonsville, MD", "Mexico City",
 * "Seattle, Washington, United States") to the one canonical DataForSEO
 * `location_name` the SERP endpoints accept ("Catonsville,Maryland,United
 * States"). DataForSEO matches `location_name` verbatim, so anything else —
 * spacing, abbreviations, accents, a missing country — is rejected at call
 * time with "Invalid Field: 'location_name'".
 *
 * Pure and Node-safe: callers hand in one country's registry (see
 * fetchSerpLocationsForCountry / the repair script).
 */

import {
  foldLocationText as foldSegment,
  LOCATION_TYPE_RANK,
  REGION_ABBREVIATIONS,
} from "../src/shared/serp-location-search";

export { foldSegment };

export interface SerpRegistryLocation {
  locationCode: number;
  locationName: string;
  locationType: string;
}

export type SerpLocationMatch =
  | { kind: "exact"; location: SerpRegistryLocation }
  | {
      kind: "resolved";
      location: SerpRegistryLocation;
      /** Which rewrite produced the match, for review output. */
      via: "normalized" | "expanded" | "override";
    }
  | { kind: "ambiguous"; candidates: SerpRegistryLocation[] }
  | { kind: "unresolved"; suggestions: SerpRegistryLocation[] };

/** Endonyms and shorthands seen in production that the registry spells in English. */
const NAME_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  norge: "Norway",
  espana: "Spain",
  wien: "Vienna",
  "ciudad de mexico": "Mexico City",
  cdmx: "Mexico City",
  deutschland: "Germany",
  schweiz: "Switzerland",
  italia: "Italy",
  brasil: "Brazil",
  sverige: "Sweden",
  danmark: "Denmark",
  nederland: "Netherlands",
  bangalore: "Bengaluru",
};

function splitSegments(name: string): string[] {
  return name
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function foldedKey(name: string): string {
  return splitSegments(name).map(foldSegment).join(",");
}

/** "Portland metro" / "Denver area" mean the place itself. */
const NOISE_SUFFIX_RE = /\s+(metro(?:\s+area)?|area|region)$/i;

function expandSegments(segments: string[], countryCode: string): string[] {
  const abbreviations = REGION_ABBREVIATIONS[countryCode] ?? {};
  return segments.map((segment, index) => {
    if (index === 0) segment = segment.replace(NOISE_SUFFIX_RE, "");
    const folded = foldSegment(segment);
    const alias = NAME_ALIASES[folded];
    if (alias) return alias;
    // Abbreviations only make sense after a place name, never as the place.
    if (index > 0) {
      const region = abbreviations[folded];
      if (region) return region;
    }
    return segment;
  });
}

/** Brazil's registry spells regions "State of Parana"; users write "Parana". */
function segmentsEqual(user: string, registry: string): boolean {
  return user === registry || registry === `state of ${user}`;
}

/**
 * True when `needle` appears in `haystack` in order (gaps allowed). A user
 * segment that repeats the place name ("Hanoi,Hanoi,Vietnam") is skipped
 * when the registry has no such level.
 */
function isOrderedSubsequence(needle: string[], haystack: string[]): boolean {
  let position = 0;
  for (const [index, item] of needle.entries()) {
    const found = haystack.findIndex(
      (candidate, at) => at >= position && segmentsEqual(item, candidate),
    );
    if (found < 0) {
      if (index > 0 && item === needle[0]) continue;
      return false;
    }
    position = found + 1;
  }
  return true;
}

function typeRank(location: SerpRegistryLocation): number {
  return LOCATION_TYPE_RANK[location.locationType] ?? Number.POSITIVE_INFINITY;
}

/**
 * Rank candidates that share the user's first segment as their place name and
 * contain every user segment in order. Fewer registry segments win (the city
 * itself over a same-named suburb inside it), then the more common place type.
 */
function rankCandidates(
  userSegments: string[],
  registry: SerpRegistryLocation[],
): SerpRegistryLocation[] {
  const folded = userSegments.map(foldSegment);
  const [place] = folded;
  if (!place) return [];
  const candidates = registry
    .filter((location) => Number.isFinite(typeRank(location)))
    .map((location) => ({
      location,
      segments: splitSegments(location.locationName).map(foldSegment),
    }))
    .filter(
      ({ segments }) =>
        segments[0] === place && isOrderedSubsequence(folded, segments),
    );
  candidates.sort(
    (a, b) =>
      a.segments.length - b.segments.length ||
      typeRank(a.location) - typeRank(b.location) ||
      a.location.locationName.localeCompare(b.location.locationName),
  );
  return candidates.map(({ location }) => location);
}

/** Candidates that tie on segment count and type are different places. */
function isUniqueBest(ranked: SerpRegistryLocation[]): boolean {
  if (ranked.length < 2) return true;
  const [best, next] = ranked;
  return (
    splitSegments(best.locationName).length !==
      splitSegments(next.locationName).length ||
    typeRank(best) !== typeRank(next)
  );
}

export function matchSerpLocation(
  input: string,
  registry: SerpRegistryLocation[],
  countryCode: string,
): SerpLocationMatch {
  const trimmed = input.trim();
  const exact = registry.find((location) => location.locationName === trimmed);
  if (exact) return { kind: "exact", location: exact };

  const key = foldedKey(trimmed);
  const normalized = registry.find(
    (location) => foldedKey(location.locationName) === key,
  );
  if (normalized) {
    return { kind: "resolved", location: normalized, via: "normalized" };
  }

  const segments = expandSegments(splitSegments(trimmed), countryCode);
  const ranked = rankCandidates(segments, registry);
  if (ranked.length === 0) {
    // Suggest places that merely start with the user's first word so a human
    // (or an agent) can pick.
    const suggestions = segments[0]
      ? rankCandidates([segments[0]], registry).slice(0, 3)
      : [];
    return { kind: "unresolved", suggestions };
  }
  if (!isUniqueBest(ranked)) {
    return { kind: "ambiguous", candidates: ranked.slice(0, 5) };
  }
  return { kind: "resolved", location: ranked[0], via: "expanded" };
}
