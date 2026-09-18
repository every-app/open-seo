/**
 * Rank a country's SERP location registry against a free-form place query
 * ("Catonsville MD", "Portland OR"). DataForSEO matches `location_name`
 * verbatim, so users need the canonical row, not a substring scan: a plain
 * `includes` filter buries "Portland,Oregon,United States" under every
 * "…,Portland,…" row that happens to sort earlier in the registry.
 *
 * The folding, abbreviation and type-rank primitives are shared with the
 * repair script's fuzzy matcher (scripts/serp-location-match.ts) so both
 * agree on what a name means.
 */

interface RankableSerpLocation {
  locationName: string;
  locationType: string;
}

/**
 * Region abbreviations users write after a city name, per country. Keyed by
 * ISO country so "Rio de Janeiro" in Brazil never reads "de" as Delaware.
 */
export const REGION_ABBREVIATIONS: Record<string, Record<string, string>> = {
  us: {
    al: "Alabama",
    ak: "Alaska",
    az: "Arizona",
    ar: "Arkansas",
    ca: "California",
    co: "Colorado",
    ct: "Connecticut",
    de: "Delaware",
    fl: "Florida",
    ga: "Georgia",
    hi: "Hawaii",
    id: "Idaho",
    il: "Illinois",
    in: "Indiana",
    ia: "Iowa",
    ks: "Kansas",
    ky: "Kentucky",
    la: "Louisiana",
    me: "Maine",
    md: "Maryland",
    ma: "Massachusetts",
    mi: "Michigan",
    mn: "Minnesota",
    ms: "Mississippi",
    mo: "Missouri",
    mt: "Montana",
    ne: "Nebraska",
    nv: "Nevada",
    nh: "New Hampshire",
    nj: "New Jersey",
    nm: "New Mexico",
    ny: "New York",
    nc: "North Carolina",
    nd: "North Dakota",
    oh: "Ohio",
    ok: "Oklahoma",
    or: "Oregon",
    pa: "Pennsylvania",
    ri: "Rhode Island",
    sc: "South Carolina",
    sd: "South Dakota",
    tn: "Tennessee",
    tx: "Texas",
    ut: "Utah",
    vt: "Vermont",
    va: "Virginia",
    wa: "Washington",
    wv: "West Virginia",
    wi: "Wisconsin",
    wy: "Wyoming",
    dc: "District of Columbia",
  },
  ca: {
    ab: "Alberta",
    bc: "British Columbia",
    mb: "Manitoba",
    nb: "New Brunswick",
    nl: "Newfoundland and Labrador",
    ns: "Nova Scotia",
    nt: "Northwest Territories",
    nu: "Nunavut",
    on: "Ontario",
    pe: "Prince Edward Island",
    qc: "Quebec",
    sk: "Saskatchewan",
    yt: "Yukon",
  },
  au: {
    nsw: "New South Wales",
    vic: "Victoria",
    qld: "Queensland",
    sa: "South Australia",
    tas: "Tasmania",
    act: "Australian Capital Territory",
  },
};

/**
 * Registry rows a user could plausibly mean by a place name, most specific
 * first. Postal codes, airports and universities are absent on purpose: they
 * are never what "City, ST" means.
 */
export const LOCATION_TYPE_RANK: Record<string, number> = {
  City: 0,
  Municipality: 1,
  "City Region": 2,
  Borough: 2,
  County: 3,
  State: 4,
  Province: 4,
  Region: 4,
  Country: 5,
  "DMA Region": 6,
  Neighborhood: 7,
  District: 7,
};

/** Lowercase, strip accents, collapse whitespace. */
export function foldLocationText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Portland OR" → ["portland", "oregon"]. Abbreviations expand only for the
 * given country and never on the first token: "La Crosse" and "De Pere" are
 * place names, not states.
 */
function tokenize(query: string, countryCode: string | undefined): string[] {
  const tokens = foldLocationText(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  const abbreviations = REGION_ABBREVIATIONS[countryCode?.toLowerCase() ?? ""];
  if (!abbreviations) return tokens;
  return tokens.map((token, index) => {
    const region = index > 0 ? abbreviations[token] : undefined;
    return region ? foldLocationText(region) : token;
  });
}

export function rankSerpLocations<T extends RankableSerpLocation>(
  query: string,
  locations: readonly T[],
  countryCode?: string,
): T[] {
  const tokens = tokenize(query, countryCode);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(" ");
  const head = tokens[0];

  const scored: { location: T; score: number; folded: string }[] = [];
  for (const location of locations) {
    const folded = foldLocationText(location.locationName);
    // Multi-word expansions ("new york") never survive a whitespace split, so
    // match each token against the whole name.
    if (!tokens.every((token) => folded.includes(token))) continue;
    const comma = folded.indexOf(",");
    const place = comma < 0 ? folded : folded.slice(0, comma).trim();
    const score =
      place === phrase
        ? 0
        : place === head
          ? 1
          : place.startsWith(head)
            ? 2
            : 3;
    scored.push({ location, score, folded });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (LOCATION_TYPE_RANK[a.location.locationType] ?? 9) -
        (LOCATION_TYPE_RANK[b.location.locationType] ?? 9) ||
      (a.folded < b.folded ? -1 : a.folded > b.folded ? 1 : 0),
  );
  return scored.slice(0, 10).map((entry) => entry.location);
}
