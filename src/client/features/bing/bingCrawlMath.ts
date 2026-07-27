export type BingCrawlRow = {
  date: string | null;
  crawledPages: number;
  inIndex: number;
  inLinks: number;
  crawlErrors: number;
  code4xx: number;
  code5xx: number;
  blockedByRobotsTxt: number;
  allOtherCodes: number;
};

export type CrawlTile = {
  value: number;
  /** Signed change vs ~28 days earlier (or the series start when shorter);
   *  null when the series is too short to compare. */
  delta: number | null;
};

type CrawlTiles = {
  inIndex: CrawlTile;
  inLinks: CrawlTile;
  /** Total crawl errors + 4xx + 5xx over the last 7 rows. */
  errors7d: number;
};

const COMPARE_DAYS = 28;
const MIN_ROWS_FOR_DELTA = 8;

export function totalErrors(row: BingCrawlRow): number {
  return row.crawlErrors + row.code4xx + row.code5xx;
}

function tile(value: number, previous: number | undefined): CrawlTile {
  return {
    value,
    delta: previous === undefined ? null : value - previous,
  };
}

/** Tile numbers from a date-ascending daily crawl series: latest indexed and
 *  inbound-link counts with a vs-~28-days-ago delta, and a 7-day error sum.
 *  Returns null when there are no rows. */
export function buildCrawlTiles(rows: BingCrawlRow[]): CrawlTiles | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const baseline =
    rows.length > MIN_ROWS_FOR_DELTA
      ? rows[Math.max(0, rows.length - 1 - COMPARE_DAYS)]
      : null;
  return {
    inIndex: tile(latest.inIndex, baseline?.inIndex),
    inLinks: tile(latest.inLinks, baseline?.inLinks),
    errors7d: rows.slice(-7).reduce((sum, row) => sum + totalErrors(row), 0),
  };
}
