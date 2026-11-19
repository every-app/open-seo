import { z } from "zod";
import { fetchDataforseoTask } from "@/lib/free-tools/server";

// The search data a report is written from, asked of DataForSEO directly.
// These are the five lookups the customer-keywords skill names, answered in
// the same columns OpenSEO's own tools answer in, because the skill reads
// them by name: `intent` on a keyword, and `best position` and `seen in` on a
// results page.
//
// Every report is for one market: the United States, in English.

const MARKET = { location_code: 2840, language_code: "en" };
const DOMAIN_KEYWORDS = 100;
const SEED_KEYWORDS = 150;
/** Google serves automated readers pages that vary, so each results page is read this many times and merged. */
const SERP_READS = 3;
const SERP_ROWS = 20;

/** What a lookup was charged, added to the report's running total. */
type Charge = (usd: number) => void;
type Lookup = { apiKey: string; charge: Charge };

async function ask(
  lookup: Lookup,
  path: string,
  payload: Record<string, unknown>,
) {
  const task = await fetchDataforseoTask(path, payload, lookup.apiKey);
  lookup.charge(task.cost);
  return task.result;
}

type Cell = string | number | null | undefined;
/** Rows as lines of cells, one header line first. A missing value is a dash. */
function table(headers: string[], rows: Cell[][]): string {
  const line = (cells: Cell[]) =>
    cells
      .map((cell) => (cell == null ? "—" : String(cell).replaceAll("|", "/")))
      .join(" | ");
  return [line(headers), ...rows.map(line)].join("\n");
}

const keywordSchema = z.looseObject({
  keyword: z.string().nullish(),
  keyword_info: z
    .looseObject({
      search_volume: z.number().nullish(),
      cpc: z.number().nullish(),
      competition: z.number().nullish(),
    })
    .nullish(),
  keyword_properties: z
    .looseObject({ keyword_difficulty: z.number().nullish() })
    .nullish(),
  search_intent_info: z
    .looseObject({ main_intent: z.string().nullish() })
    .nullish(),
});
const KEYWORD_HEADERS = [
  "keyword",
  "volume",
  "KD",
  "CPC",
  "competition",
  "intent",
];
const KEYWORD_COLUMNS =
  'Columns: volume = monthly searches, KD = keyword difficulty (0-100), CPC in USD, competition = paid competition (0-1), intent = funnel stage; "—" = unavailable.';
function keywordRow(input: unknown): Cell[] {
  const item = keywordSchema.parse(input);
  return [
    item.keyword,
    item.keyword_info?.search_volume,
    item.keyword_properties?.keyword_difficulty,
    item.keyword_info?.cpc,
    item.keyword_info?.competition,
    item.search_intent_info?.main_intent,
  ];
}
const itemsOf = (result: unknown) =>
  z.looseObject({ items: z.array(z.unknown()).nullish() }).parse(result ?? {})
    .items ?? [];

/** A site's estimated monthly organic traffic and how many keywords it ranks for. */
export async function domainOverview(lookup: Lookup, domain: string) {
  const result = await ask(
    lookup,
    "/v3/dataforseo_labs/google/domain_rank_overview/live",
    { target: domain, ...MARKET, limit: 1 },
  );
  const organic = z
    .looseObject({
      metrics: z
        .looseObject({
          organic: z
            .looseObject({
              etv: z.number().nullish(),
              count: z.number().nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .parse(itemsOf(result)[0] ?? {}).metrics?.organic;
  const lines = [
    `Target: ${domain}`,
    `Organic traffic: ${organic?.etv == null ? "?" : Math.round(organic.etv)}`,
    `Organic keywords: ${organic?.count ?? "?"}`,
  ];
  if (!organic?.count)
    lines.push("No ranked keywords found for this domain in this market.");
  return lines.join("\n");
}

/** The keywords a site ranks for, with positions, most traffic first. */
export async function domainKeywords(lookup: Lookup, domain: string) {
  const result = await ask(
    lookup,
    "/v3/dataforseo_labs/google/ranked_keywords/live",
    {
      target: domain,
      ...MARKET,
      limit: DOMAIN_KEYWORDS,
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
    },
  );
  const rows = itemsOf(result).map((input) => {
    const item = z
      .looseObject({
        keyword_data: keywordSchema.nullish(),
        ranked_serp_element: z
          .looseObject({
            serp_item: z
              .looseObject({
                rank_group: z.number().nullish(),
                etv: z.number().nullish(),
              })
              .nullish(),
          })
          .nullish(),
      })
      .parse(input);
    const ranked = item.ranked_serp_element?.serp_item;
    return [
      item.keyword_data?.keyword,
      ranked?.rank_group,
      item.keyword_data?.keyword_info?.search_volume,
      item.keyword_data?.keyword_properties?.keyword_difficulty,
      ranked?.etv == null ? null : Math.round(ranked.etv),
    ];
  });
  if (!rows.length) return `No ranked keywords found for ${domain}.`;
  return `Keywords for ${domain} (${rows.length}). Columns: KD = keyword difficulty (0-100), traffic = estimated monthly organic visits; "—" = unavailable.\n${table(["keyword", "position", "volume", "KD", "traffic"], rows)}`;
}

/** Search volume, difficulty and intent for keywords already in hand. */
export async function keywordMetrics(lookup: Lookup, keywords: string[]) {
  const result = await ask(
    lookup,
    "/v3/dataforseo_labs/google/keyword_overview/live",
    { keywords, ...MARKET },
  );
  const rows = itemsOf(result).map(keywordRow);
  const missing =
    new Set(keywords.map((k) => k.trim().toLowerCase())).size - rows.length;
  const header =
    `Fetched metrics for ${rows.length} keywords. ${KEYWORD_COLUMNS}` +
    (missing > 0
      ? ` ${missing} requested keywords returned no data, usually because the search volume is too low to measure.`
      : "");
  return rows.length ? `${header}\n${table(KEYWORD_HEADERS, rows)}` : header;
}

const escapeLike = (term: string) =>
  term.replace(/[\\%_]/g, (match) => `\\${match}`);

/**
 * Keyword ideas for one seed. "best * for dogs" asks for keywords containing
 * the longest literal stretch ("for dogs") and keeps only those that match
 * the whole pattern, pinned to word boundaries so "seo" can't match "seoul".
 */
async function seedIdeas(lookup: Lookup, seed: string): Promise<string> {
  const wildcard = seed.includes("*");
  const literals = seed
    .split("*")
    .map((part) => part.trim().replace(/\s+/g, " "));
  const anchor = literals.reduce((longest, part) =>
    part.length > longest.length ? part : longest,
  );
  if (!anchor) return `## "${seed}"\nRefused: add at least one word besides *.`;
  const pattern = seed
    .replace(/\s+/g, " ")
    .replace(/\*+/g, "*")
    .split("*")
    .map(escapeLike)
    .join("%");
  const filters = [pattern, `${pattern} %`, `% ${pattern}`, `% ${pattern} %`]
    .flatMap((value) => ["or", ["keyword", "like", value]])
    .slice(1);
  const result = await ask(
    lookup,
    "/v3/dataforseo_labs/google/keyword_suggestions/live",
    {
      keyword: wildcard ? anchor : seed,
      ...MARKET,
      limit: SEED_KEYWORDS,
      include_serp_info: false,
      include_clickstream_data: false,
      // DataForSEO does not apply `filters` to the seed keyword itself.
      include_seed_keyword: !wildcard,
      ...(wildcard ? { filters } : {}),
    },
  );
  const seedRow = z
    .looseObject({ seed_keyword_data: z.unknown().nullish() })
    .parse(result ?? {}).seed_keyword_data;
  const rows = [...(seedRow ? [seedRow] : []), ...itemsOf(result)]
    .slice(0, SEED_KEYWORDS)
    .map(keywordRow);
  const header = `## "${seed}" — ${rows.length} keywords`;
  return rows.length
    ? `${header}\n${table(KEYWORD_HEADERS, rows)}`
    : `${header}\n(no keywords returned) Try a shorter, broader seed.`;
}

/** Keyword ideas for a few seeds at once. One bad seed doesn't fail the others. */
export async function keywordIdeas(lookup: Lookup, seeds: string[]) {
  const sections = await Promise.all(
    seeds.map((seed) =>
      seedIdeas(lookup, seed).catch(
        () => `## "${seed}"\nThis seed's lookup failed.`,
      ),
    ),
  );
  return `${KEYWORD_COLUMNS}\n\n${sections.join("\n\n")}`;
}

const serpItemSchema = z.looseObject({
  type: z.string(),
  rank_group: z.number().nullish(),
  rank_absolute: z.number().nullish(),
  domain: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  description: z.string().nullish(),
  breadcrumb: z.string().nullish(),
});
type SerpItem = z.infer<typeof serpItemSchema>;

const hostOf = (address: string) => {
  try {
    return new URL(address).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Google wraps many results in a google.com/goto redirect, which DataForSEO
 * reports with domain "google.com". The real site is then only in the
 * breadcrumb ("https://www.runnersworld.com › gear"). When the breadcrumb
 * isn't an address the domain is unknown, which beats crediting google.com.
 */
function siteOf(item: SerpItem): string | null {
  const host = item.url ? hostOf(item.url) : null;
  const redirect = host?.endsWith("google.com") && item.url?.includes("/goto");
  if (!redirect)
    return item.domain?.toLowerCase().replace(/^www\./, "") ?? null;
  const first = item.breadcrumb?.split("›")[0]?.trim() ?? "";
  return /^https?:\/\//i.test(first) ? hostOf(first) : null;
}

// Reciprocal rank fusion's usual constant. It is large enough that a site on
// another read beats any move up the page, so one odd read can't put its
// sites above the ones the reads agree on.
const FUSION_K = 60;
const position = (item: SerpItem) =>
  item.rank_group ?? item.rank_absolute ?? Number.MAX_SAFE_INTEGER;

type Merged = {
  item: SerpItem;
  site: string | null;
  seenIn: number;
  score: number;
};

/**
 * Several reads of one results page as one list. Organic rows come first,
 * the sites the reads agree on at the top, each at the best position any
 * read gave it. Other kinds of result follow in page order.
 */
function mergeReads(reads: SerpItem[][]): Merged[] {
  const rows = new Map<string, Merged>();
  for (const read of reads) {
    const seenOnRead = new Set<string>();
    for (const item of read) {
      const site = siteOf(item);
      const key = `${item.type}|${site ?? item.title ?? ""}`;
      // Rows arrive in page order, so a site's first row on a read is its best.
      if (seenOnRead.has(key)) continue;
      seenOnRead.add(key);
      const score = 1 / (FUSION_K + position(item));
      const row = rows.get(key);
      if (!row) {
        rows.set(key, { item, site, seenIn: 1, score });
        continue;
      }
      row.seenIn += 1;
      row.score += score;
      if (position(item) < position(row.item)) row.item = item;
    }
  }
  const all = [...rows.values()];
  const organic = all
    .filter((row) => row.item.type === "organic")
    .sort((a, b) => b.score - a.score);
  const features = all
    .filter((row) => row.item.type !== "organic")
    .sort(
      (a, b) =>
        (a.item.rank_absolute ?? Number.MAX_SAFE_INTEGER) -
        (b.item.rank_absolute ?? Number.MAX_SAFE_INTEGER),
    );
  return [...organic, ...features];
}

async function resultsFor(lookup: Lookup, keyword: string) {
  const reads = await Promise.all(
    Array.from({ length: SERP_READS }, async () => {
      const result = await ask(
        lookup,
        "/v3/serp/google/organic/live/advanced",
        { keyword, ...MARKET, device: "desktop", depth: 10 },
      ).catch(() => null);
      return result === null
        ? null
        : itemsOf(result).flatMap((input) => {
            const item = serpItemSchema.safeParse(input);
            return item.success ? [item.data] : [];
          });
    }),
  );
  const read = reads.filter((items) => items !== null);
  if (!read.length)
    return {
      text: `## ${keyword}\nThis results page couldn't be read.`,
      hosts: [],
    };
  const merged = mergeReads(read).slice(0, SERP_ROWS);
  const rows = merged.map((row, index) => [
    index + 1,
    row.item.type,
    row.item.type === "organic" ? position(row.item) : null,
    row.seenIn,
    row.site,
    row.item.title,
    row.item.url,
    row.item.description?.slice(0, 120),
  ]);
  return {
    text: `## ${keyword}\n${table(
      [
        "rank",
        "type",
        "best position",
        `seen in (of ${read.length} reads)`,
        "domain",
        "title",
        "url",
        "description",
      ],
      rows,
    )}`,
    // Only what the provider put in a result's own domain field, so a report
    // can't earn a link by asking about a host.
    hosts: merged.flatMap((row) =>
      row.item.type === "organic" && row.site ? [row.site] : [],
    ),
  };
}

/** Who is on page one for a few keywords, and the sites those pages named. */
export async function searchResults(lookup: Lookup, keywords: string[]) {
  const pages = await Promise.all(
    keywords.map((keyword) => resultsFor(lookup, keyword)),
  );
  return {
    text: `Sites the reads agree on come first, so read the top rows as who ranks. \`rank\` is only a row's place in this list; quote \`best position\` as a site's position. A null \`domain\` is usually a forum thread: name it by its title.\n\n${pages.map((page) => page.text).join("\n\n")}`,
    hosts: pages.flatMap((page) => page.hosts),
  };
}
