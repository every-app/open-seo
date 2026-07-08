# Local Rank Tracking — Locations Data & Search Experience Plan

Status: Phase 1 implemented (2026-07-07); Phases 2–3 are open proposals. Documents
the storage decision for DataForSEO's location registry and the roadmap for the
location picker, following the city/region rank-tracking feature.

## Context

The Local targeting combobox searches DataForSEO's per-country location registry.
The registry endpoint (`/v3/serp/google/locations/{iso}`) is **free** but returns the
full country list per call:

| Dataset                                        | Entries | Raw JSON | Gzipped |
| ---------------------------------------------- | ------- | -------- | ------- |
| US, full response                              | 60,477  | 9.5 MB   | —       |
| US, slim (City/County/Municipality/DMA/Region) | 22,871  | 1.5 MB   | 200 KB  |
| US, slim + Postal Code                         | 54,718  | 3.7 MB   | 370 KB  |

Data changes rarely (Google geotarget updates, roughly quarterly). 142 supported
countries. Today every debounced keystroke re-fetches and re-parses the 9.5 MB
response on the Worker (~3 s per search, large transient heap on 128 MB isolates
with an OOM history).

Constraints that shaped the decision:

- **Self-host is first-class**: must work on a fresh deploy with only runtime
  DataForSEO creds — no bespoke build/refresh pipelines.
- **Two DB providers** (D1 default, Postgres opt-in): DB-backed approaches pay a
  double implementation tax (schema parity is test-enforced).
- **Worker memory discipline**: no multi-MB retained globals, bounded per-request
  parses.
- **Eager bundle budget**: client additions must be lazy.
- Existing bindings: general-purpose `KV`, `R2` (with a working JSON cache helper,
  `src/server/lib/r2-cache.ts`, already used for DataForSEO responses), D1, DOs,
  cron triggers.

## Decision: phased, R2-cached server search now; UX investment next

### Phase 1 — kill the 9.5 MB-per-keystroke path (ship with the PR)

Cache the **slim** per-country list in R2 via the existing `getCached`/`setCached`
helper, keyed `serp-locations:{iso}`, soft TTL 30 days. On cache miss, do today's
fetch+filter once and store the slim result. Layer `caches.default` (per-colo,
`max-age=86400`) in front so repeat searches in a region skip R2 entirely.

- First search per country: unchanged (~3 s, once per country per month).
- Steady state: one small cache read + a ~1.5 MB parse + in-memory filter,
  tens of ms. No isolate-global retention.
- Self-host: works day one — R2 binding and DataForSEO creds already required.
  Lazy fill means no seeding step and no cron required (a quarterly cron refresh
  is a nice-to-have, not a dependency).
- Provider-agnostic (no D1/PG schema work).
- Effort: ~30–60 lines. No new bindings, no migrations.

KV is a near-equivalent alternative (25 MiB value limit fits; hot-read latency
slightly better). R2 wins on "least new code" because the cache helper already
exists and this is exactly its existing use case (caching DataForSEO JSON).

**Prewarm**: when the user flips targeting to **Local** (or changes country while
Local), fire a fire-and-forget warm request so the cache is hot before the first
keystroke. This hides the one slow first search almost entirely.

### Phase 2 — make the picker good (fast follow, independent of Phase 1)

From the UX design pass:

1. **Ranking with a prominence prior.** The registry has no population data, so
   naive substring ranking puts "Portland-Auburn, ME (DMA)" above "Portland,
   Oregon". Join the registry offline against GeoNames/Census once and ship a
   ~30 KB per-country boost-tier table (metro/+40, city/+20, capital/+15) inside
   the cached blob. Score = match tier (exact > prefix > token-prefix > substring)
   - type weight (City +30, DMA +10, County +5) + prominence. Two-line result rows,
     always disambiguated ("Portland, OR" / "City · Oregon, United States").
2. **Cities-only default** with a subtle type filter (`Cities | Metro areas |
Counties`). Google localizes SERPs to the location centroid; city centroids are
   what reproduce a local prospect's results — DMA is media-buying granularity and
   is mislabeled jargon for most users (render as "Metro area").
3. **Suggestions before typing**: recently used locations in this project/org
   (agencies reuse the same 3–5 metros), then popular metros for the country.
   Note: **GSC has no city dimension** in Search Analytics — suggestions must come
   from our own config history, not GSC.
4. **Selection confirmation line** under the field echoing the canonical stored
   name ("Tracking in: Enid, Oklahoma, United States · City") — the string is used
   verbatim in SERP queries, so mis-selection is silent revenue-relevant error.
5. **Loading UX**: skeleton rows + "Loading US locations…" only on the first
   search per country; no spinner on warm searches.

### Phase 3 — optional expansions (decide later, demand-driven)

- **ZIP fast path**: numeric query (`^\d{3,5}$`) searches a _separate_ cached
  postal blob (2.2 MB US), rendered as "73701 · Enid, OK". ZIP targeting beats
  city only for sub-metro service areas (suburb plumber inside Houston); for
  single-town businesses the city is the cleaner label. Zips do NOT remove the
  need for the registry — DataForSEO only accepts canonical location names/codes,
  and zips are registry entries themselves.
- **Multi-city fan-out**: multi-select chips in the picker → one config per city
  cloned with the same keyword set ("Create 4 configs"), capped ~10 with a credit
  cost warning. Covers the agency 3–5-metro workflow without changing the
  one-location-per-config data model.
- **Server-side validation of `location_name`** at config save (against the cached
  registry) — closes the "any string ≤200 chars reaches the SERP API" gap that
  currently only client selection prevents.

## Options considered and rejected (for the record)

| Option                                               | Why not                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Static assets + client-side search** (best raw UX) | Refresh requires redeploy; self-hosters would be pinned to release-time snapshots. Viable later as a _bundled seed_ under the R2 cache, not as the mechanism.                                                                                                          |
| **D1 table (+ FTS5) / PG parity**                    | FTS5 works on D1, but it means schema + migrations + a second Postgres FTS implementation for a read-only quarterly dataset; `wrangler d1 export` also can't handle virtual tables. Revisit only if server-side validation + MCP location search justify a real table. |
| **Durable Object per country**                       | Fastest warm path, but DOs pin to first-request region forever (bad for a global base searching foreign countries), add a new binding + migration to self-host, and buy coordination guarantees this read-only data doesn't need.                                      |
| **KV key-per-location + `list({prefix})`**           | Prefix-only matching, ~3.2M keys to seed/reseed, list ops cost more than reads. Strictly worse than one blob.                                                                                                                                                          |
| **"Just accept zip codes" instead of the list**      | Doesn't avoid the list: DataForSEO requires canonical registry values, and zips are registry entries. Free-text-plus-validate-at-save has bad discoverability and fails after the fact. Zips return as a Phase 3 _addition_.                                           |
| **Vectorize / Smart Placement / Cache Reserve**      | Wrong tools: no semantic matching needed; no backend concentration to place near; Cache Reserve is for public zone-level HTTP responses.                                                                                                                               |

## Sequencing recommendation

1. Phase 1 + prewarm ships with the feature branch — it converts the
   feature from "works but worrying" to "fast and boring".
2. Phase 2 items 1–2 (ranking + cities default) next; they fix the one visibly
   wrong behavior (DMA-above-city ordering).
3. Phase 2 items 3–5 and Phase 3 as demand appears (multi-city fan-out is the one
   agencies will ask for first).
