// Starting points for the weekly backlink report. Tune them after the first
// runs; nothing else in the feature hard-codes a number.

/** Default window: links first seen or lost in the last 7 days. */
export const DEFAULT_SINCE_DAYS = 7;
export const MAX_SINCE_DAYS = 90;

/** Rows returned per list unless the caller asks for more. */
export const DEFAULT_MAX_ROWS = 25;
export const MAX_ROWS = 100;

/**
 * A lost link is "important" at or above this linking-domain rank (DataForSEO's
 * 0 to 100 scale), provided it is dofollow and not spam.
 */
export const DEFAULT_IMPORTANT_MIN_DOMAIN_RANK = 20;

/** DataForSEO returns at most 1,000 rows per request. */
export const BACKLINKS_FETCH_LIMIT = 1000;

/** Competitor opportunities fetched before spam filtering and ranking. */
export const OPPORTUNITY_FETCH_LIMIT = 200;

/**
 * The window filter on competitor links needs one condition per competitor and
 * DataForSEO allows 8 conditions, so only this many competitors are watched in
 * the default "new" mode.
 */
export const MAX_NEW_MODE_COMPETITORS = 8;

/** Spam domains named in the spam summary. */
export const TOP_SPAM_DOMAINS = 5;
