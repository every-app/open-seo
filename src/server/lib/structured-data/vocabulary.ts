/**
 * Lookups over the generated Schema.org tables.
 *
 * The generated module stores space-joined term lists so its diffs stay
 * readable; this module splits them on demand and memoizes the one walk that
 * is not O(1) — the class hierarchy.
 *
 * Every lookup goes through `Object.hasOwn`: the tables are plain objects, so
 * `"toString" in TYPE_PARENTS` would otherwise report a prototype method as a
 * valid Schema.org type.
 */
import {
  DATA_TYPES,
  ENUM_MEMBERS,
  PROPERTY_DOMAINS,
  PROPERTY_RANGES,
  SCHEMA_VERSION,
  SUPERSEDED_BY,
  TYPE_PARENTS,
} from "./vocabulary.generated";

export { SCHEMA_VERSION };

function words(value: string | undefined): string[] {
  return value ? value.split(" ") : [];
}

const dataTypes = new Set(words(DATA_TYPES));
const ancestorCache = new Map<string, string[]>();

/** Strips the `https://schema.org/` (or `http://`, or `schema:`) prefix that
 *  markup sometimes uses in place of a bare term. */
export function bareTerm(value: string): string {
  return value
    .replace(/^https?:\/\/schema\.org\//, "")
    .replace(/^schema:/, "")
    .trim();
}

export function isKnownType(type: string): boolean {
  return Object.hasOwn(TYPE_PARENTS, type);
}

export function isKnownProperty(property: string): boolean {
  return Object.hasOwn(PROPERTY_DOMAINS, property);
}

export function isDataType(type: string): boolean {
  return dataTypes.has(type);
}

export function propertyRanges(property: string): string[] {
  return Object.hasOwn(PROPERTY_RANGES, property)
    ? words(PROPERTY_RANGES[property])
    : [];
}

/** The term that replaces a retired one, or null. */
export function supersededBy(term: string): string | null {
  return Object.hasOwn(SUPERSEDED_BY, term)
    ? (words(SUPERSEDED_BY[term])[0] ?? null)
    : null;
}

/** Members of an enumeration class, or null when the type is not one. */
export function enumMembers(type: string): string[] | null {
  return Object.hasOwn(ENUM_MEMBERS, type) ? words(ENUM_MEMBERS[type]) : null;
}

/**
 * The type itself followed by its supertypes, nearest first. Breadth-first, so
 * `NewsArticle` yields `[NewsArticle, Article, CreativeWork, Thing]` and a
 * rule lookup can take the first match as the most specific one.
 */
export function ancestorChain(type: string): string[] {
  const cached = ancestorCache.get(type);
  if (cached) return cached;

  const chain: string[] = [];
  const seen = new Set<string>();
  let frontier = [type];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      if (seen.has(current)) continue;
      seen.add(current);
      chain.push(current);
      if (Object.hasOwn(TYPE_PARENTS, current)) {
        next.push(...words(TYPE_PARENTS[current]));
      }
    }
    frontier = next;
  }
  ancestorCache.set(type, chain);
  return chain;
}

export function isTypeOrSubtypeOf(type: string, ancestor: string): boolean {
  return ancestorChain(type).includes(ancestor);
}

/** True when the property is declared on any of these types or their
 *  supertypes. Schema.org's `domainIncludes` is advisory, so callers report a
 *  miss as a warning rather than an error. */
export function propertyAppliesTo(property: string, types: string[]): boolean {
  const domains = Object.hasOwn(PROPERTY_DOMAINS, property)
    ? words(PROPERTY_DOMAINS[property])
    : [];
  if (domains.length === 0) return true;
  return types.some((type) => {
    const chain = ancestorChain(type);
    return domains.some((domain) => chain.includes(domain));
  });
}
