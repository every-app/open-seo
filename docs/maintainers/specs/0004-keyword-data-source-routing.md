# Keyword data source routing and the clickstream default

## Status

Accepted (June 2026). Superseded in part (September 2026): auto mode blends
`keyword_suggestions` + `keyword_ideas` at half the result limit each instead
of cascading related → suggestions → ideas, and Labs live pricing has risen to
$0.012/task + $0.00012/row (measured against the live API). The default
150-row research call is now two tasks, $0.042 raw → 54 credits, not $0.025 →
32 credits. The routing, clickstream, and Google-Ads-coverage decisions below
still hold.

## Context

Keyword research is the largest credit spend for OpenSEO users, and coverage
has a hard gap: DataForSEO Labs supports 94 countries, so a customer in
Iceland (location 2352) cannot run keyword research at all.

Three data sources were on the table:

- **DataForSEO Labs** — our existing source. Per-row pricing ($0.01/task +
  $0.0001/row), and the only source for keyword difficulty, search intent,
  and SERP-feature context. Its `include_clickstream_data` flag doubles the
  request cost; its only effect is refined volume numbers — the standard
  `keyword_info.search_volume` is the same Google-Ads-derived volume every
  mainstream tool shows.
- **DataForSEO Keywords Data (Google Ads endpoints)** — same vendor, flat
  $0.075 per live request (up to 1,000 keywords for `search_volume`, up to
  20 seeds for `keywords_for_keywords`), 217 countries including Iceland. No
  difficulty, intent, or SERP data; volumes are bucketed and aggregate close
  variants.
- **Direct Google Ads API** — free, but not usable in a SaaS: Google's
  Targeting-data policy forbids collecting Keyword Planner data "for any
  purposes other than creating or managing Google Ads campaigns," and
  exposing it to users requires the full Required Minimum Functionality (a
  campaign-management suite). Volumes are bucketed without active ad spend.

## Decision

Every supported country has exactly one keyword-data provider, resolved by
`getKeywordDataProvider(locationCode)` in `src/shared/keyword-locations.ts`.
There is no user-facing provider choice.

1. **Labs is the default provider.** Countries Labs does not cover are
   flagged `googleAdsOnly` in `LOCATION_OPTIONS` and are served by the
   Keywords Data Google Ads endpoints. Unknown location codes fall back to
   Labs, which rejects them with its own error.
2. **Routing per feature:**

   | Feature                                             | Labs country                   | Google-Ads-only country (e.g. Iceland)                                                          |
   | --------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
   | Keyword research (UI + `research_keywords`)         | Labs suggestions + ideas blend | `keywords_for_keywords` (single source)                                                         |
   | `get_keyword_metrics`, rank-tracking metric refresh | Labs keyword_overview          | `search_volume`                                                                                 |
   | SERP analysis, `get_serp_results`, rank tracking    | SERP API                       | SERP API (supports all countries)                                                               |
   | Domain overview, ranked keywords, SERP competitors  | Labs                           | **Unavailable** — pickers filtered to Labs countries; MCP tools return a clear validation error |

3. **Google-Ads-sourced rows carry no keyword difficulty or intent**
   (`keywordDifficulty: null`, `intent: "unknown"`). The research page and
   the MCP tool descriptions state this whenever such a country is in play.
4. **Clickstream refinement is opt-in per call and defaults to off**, for
   the Labs research endpoints (related/suggestions/ideas) and keyword
   overview. Users opt in via the labeled checkbox on the research page
   (URL param `cs`, carried per keyword tab, hidden for Google-Ads-only
   countries) or via `includeClickstreamData` on the `research_keywords` and
   `get_keyword_metrics` MCP tools. The label and tool descriptions must
   state the 2× credit cost. The flag is part of the research cache key.
5. **Language codes for Google-Ads-only countries must exist in both the
   Google Ads and SERP language lists** — the country picker is shared with
   rank tracking, which uses the SERP API. China is excluded: its Ads
   language code (`zh_CN`) conflicts with the SERP format (`zh-CN`), and
   Google search does not meaningfully operate there.
6. **Billing is unchanged.** `keywords_data/*` task costs flow through the
   same envelope → markup → Autumn pipeline as Labs calls and map to the
   `keyword_research` credit feature (rank tracking overrides to
   `rank_tracking`).

## Rationale

Cost at our actual defaults (research default = 150 rows/seed; credits =
USD × 1.28 markup × 1000):

| Call               | Labs (with clickstream) | Labs (default) | Google Ads     |
| ------------------ | ----------------------- | -------------- | -------------- |
| research, 150 rows | $0.050 → 64 cr          | $0.025 → 32 cr | $0.075 → 96 cr |
| research, 500 rows | $0.120 → 154 cr         | $0.060 → 77 cr | $0.075 → 96 cr |
| metrics, 100 kw    | $0.020 → 26 cr          | same           | $0.075 → 96 cr |
| metrics, 700 kw    | $0.080 → 103 cr         | same           | $0.075 → 96 cr |

- A wholesale switch to Google Ads data would raise the cost of typical
  calls and lose difficulty/intent; replicating difficulty alone via
  `bulk_keyword_difficulty` ($0.11/1k) erases any savings. Hybrid keeps the
  better data where it exists and adds coverage where it doesn't.
- Always-on clickstream silently doubled the #1 spend feature for a marginal
  volume refinement. Off-by-default halves default research cost
  (~64 → ~32 credits per seed); the opt-in keeps the refinement available to
  users who want it, priced visibly.
- The direct Google Ads API is rejected on policy, not effort — revisit only
  if OpenSEO ships campaign management.

## Consequences

- Iceland and ~47 other countries are selectable for keyword research and
  rank tracking; a Google-Ads-served research or metrics call costs a flat
  ~96 credits.
- Cross-country volume numbers stay roughly comparable: both providers'
  standard volumes derive from Google Ads data.
- Google Ads live endpoints allow 12 requests/min per DataForSEO account.
  Research fans out at most 5 seeds per call, so a single user stays under
  it; sustained multi-user traffic on these countries would queue.
- `keywords_for_keywords` has no limit parameter (up to 20k suggestions per
  flat-fee request); results are sorted by volume server-side and truncated
  to the requested limit.
- The research cache version was bumped (2→3) so pre-change
  clickstream-priced volumes never mix with standard ones.
- Reverting the clickstream default is a one-line change per fetcher in
  `src/server/lib/dataforseo/labs.ts`; the opt-in plumbing stays either way.

## Local volume (city, county, region)

Keyword research can target one city, county, or region inside the selected
country. Labs and clickstream serve countries only, so the keyword list,
keyword difficulty, and intent stay national. One Google Ads `search_volume`
call with the area's canonical `location_name` then replaces volume, trend,
CPC, and competition for every row. The SERP panel fetches the organic results
for the same area.

- The area must be a row of the country's location registry, the same list
  the rank tracking picker searches. The check runs before any paid call. The
  registry has no postal codes, so ZIP targeting is not offered.
- A keyword that Google Ads does not return gets empty metrics, never the
  national numbers. Google Ads fails a whole task on one keyword with certain
  symbols, an emoji, more than 80 characters, or more than 10 words, so those
  keywords are not sent.
- Local rows are not stored as keyword metrics, because stored metrics are
  keyed by country. Saved keywords keep national metrics.

Alternatives considered:

- **Append the city to the keyword** ("plumber austin"). This is a different
  query with its own, much smaller volume, not demand for the head term in
  that city.
- **Automatic fallback to the county or metro area when a small city has no
  volume.** Google geotargets link a city to its state, not to its county or
  metro area, so the fallback would need a separate city-to-county mapping.
  The results instead suggest a larger area when no keyword has local volume.
- **Coordinates or postal codes.** Coordinates resolve to country volume and
  postal codes return no volume.
