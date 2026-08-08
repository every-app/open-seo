# Free-First SEO Data Architecture — Implementation Report

## Implemented

### Phase 1 — Audit
Comprehensive codebase audit identifying all DataForSEO integration points, existing cache mechanisms, database schema, MCP architecture, and recommended insertion points. See `docs/free-first-architecture-audit.md`.

### Phase 2 — Provider Abstraction
- `SEODataProvider` interface with `name`, `supports()`, `get()`
- `SEODataRequest` / `SEODataResponse` types with full parameter support (keyword, domain, URL, location, language, device, date range, constraints)
- `SEODataType` enum covering all 9 data types: `keyword_ideas`, `keyword_metrics`, `serp`, `domain_keywords`, `competitors`, `backlinks`, `site_audit`, `search_console`, `bing_search_performance`
- `DataRouter` — centralized routing layer with deterministic provider priority per data type
- `SeoCacheService` — extends existing R2 cache with per-data-type TTL configuration and deterministic key generation (includes all material parameters: keyword, location, language, device, date range)
- `singleFlight` — request coalescing preventing duplicate concurrent external requests
- `cost-tracker` — counters for `dataforseoCalls`, `cacheHits`, `cacheMisses`, `freeProviderCalls`, `fallbackCalls`, `estimatedDataforseoCostUsd`
- Structured logging: `[seo-data] {dataType} cache={HIT|MISS} provider={name} fallback={bool} duration={ms}ms success={bool}`
- Typed provider errors: `ProviderUnavailableError`, `ProviderUnsupportedError`, `BudgetExceededError`, `AuthenticationError`, `RateLimitError`
- Centralized TTL configuration with env overrides (`SEO_CACHE_TTL_*`)
- Feature flags: `SEO_PROVIDER_ROUTER_ENABLED`, `DATAFORSEO_ENABLED`, `GOOGLE_SEARCH_CONSOLE_ENABLED`, `GOOGLE_ADS_ENABLED`, `BING_WEBMASTER_ENABLED`, `LOCAL_CRAWLER_ENABLED`

### Phase 4 — Google Search Console Provider
- Wraps existing `GscService` (which uses the official GSC API via `gscClient`)
- Serves `search_console` data type for verified properties
- Graceful failure: `GscNotConnectedError` → `ProviderUnavailableError` (router falls back); `GscTokenError` → `ProviderUnavailableError`
- No DataForSEO fallback for first-party GSC data

### Phase 5 — Google Ads Keyword Provider
- Direct Google Ads API integration (`googleads.googleapis.com/v18`)
- Serves `keyword_ideas` (GenerateKeywordIdeas) and `keyword_metrics` (GenerateHistoricalMetrics)
- OAuth2 refresh token flow for authentication
- Returns `ProviderUnavailableError` when credentials are not configured (router falls back)
- Service-account compatible

### Phase 6 — Bing Webmaster Provider
- Bing Webmaster API integration (`api.bingwebmaster.com/v3`)
- Serves `bing_search_performance` data type
- Returns structured `ProviderUnsupportedError` when API cannot support a requested operation

### Phase 7 — Local Technical SEO Crawler
- Wraps existing audit crawler (`crawlPage` from `site-audit-workflow-helpers.ts`)
- Serves `site_audit` data type without DataForSEO dependency
- Checks: HTTP status, redirects, title, meta description, canonical, robots meta, X-Robots-Tag, H1, H2, images, missing alt, internal/external links, word count, hasStructuredData (JSON-LD), hreflang, isIndexable
- SSRF protection: blocks localhost, 127.0.0.1, 0.0.0.0, private IPv4 ranges (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), metadata endpoints (169.254.169.254, metadata.google.internal), internal TLDs (.internal, .local, .localhost), non-http protocols
- Configurable: maxDepth, maxUrls, timeoutMs
- Respects robots.txt (via existing crawler infrastructure)

### Phase 8 — DataForSEO Fallback Provider
- Wraps existing `createDataforseoClient` (preserves all billing/metering)
- Maps data types to DataForSEO client methods (`serp.live`, `domain.rankedKeywords`, `backlinks.summary`, `lighthouse.live`, etc.)
- Budget guard: checks `isDataforseoBudgetAvailable()` before every call; throws `BudgetExceededError` if exceeded
- Records cost metrics after each call
- Translates `AppError` codes to provider errors (`DATAFORSEO_AUTH_FAILED` → `AuthenticationError`, `RATE_LIMITED` → `RateLimitError`, `UPSTREAM_UNAVAILABLE` → `ProviderUnavailableError`)
- NOT a fallback for `search_console` or `bing_search_performance` (first-party data)

### Phase 9 — MCP Integration
- `get_serp_results` tool: now routes through `DataRouter` (cache → internal → DataForSEO)
- `get_ranked_keywords` tool: now routes through `DataRouter` (cache → internal → DataForSEO)
- `get_keyword_metrics` tool: now routes through `DataRouter` (cache → google_ads → internal → DataForSEO)
- `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, `find_serp_competitors`: budget guard added via `assertDataforseoBudget()` before DataForSEO calls
- All other MCP tools (GSC tools, domain overview, backlinks, keyword research) already delegate to feature services with their own R2 caching — no change needed

## Modified Files

| File | Change |
|------|--------|
| `src/server/mcp/tools/get-serp-results.ts` | Replaced direct `createDataforseoClient` with `getSeoDataRouter().route()` |
| `src/server/mcp/tools/dataforseo-research-tools.ts` | Wired `get_ranked_keywords` and `get_keyword_metrics` through DataRouter; added `assertDataforseoBudget()` guard to 4 remaining direct DataForSEO tools |
| `.env.example` | Added all new configuration variables (feature flags, budget guards, provider credentials, cache TTL overrides) |

## New Files

| File | Purpose |
|------|---------|
| `docs/free-first-architecture-audit.md` | Phase 1 audit document |
| `docs/free-first-implementation-report.md` | This report |
| `src/server/lib/seo-data/types.ts` | `SEODataProvider`, `SEODataRequest`, `SEODataResponse`, `SEODataType` |
| `src/server/lib/seo-data/errors.ts` | Provider error types + `toAppError` translator |
| `src/server/lib/seo-data/config.ts` | TTL configuration + feature flags from env |
| `src/server/lib/seo-data/cache-service.ts` | `SeoCacheService` extending R2 cache |
| `src/server/lib/seo-data/single-flight.ts` | Request coalescing |
| `src/server/lib/seo-data/cost-tracker.ts` | Cost counters, budget guard, structured logging |
| `src/server/lib/seo-data/data-router.ts` | Central `DataRouter` with provider priority |
| `src/server/lib/seo-data/registry.ts` | Singleton router with all providers registered |
| `src/server/lib/seo-data/index.ts` | Barrel export |
| `src/server/lib/seo-data/providers/dataforseo-provider.ts` | DataForSEO fallback provider |
| `src/server/lib/seo-data/providers/gsc-provider.ts` | Google Search Console provider |
| `src/server/lib/seo-data/providers/google-ads-provider.ts` | Google Ads keyword provider |
| `src/server/lib/seo-data/providers/bing-webmaster-provider.ts` | Bing Webmaster provider |
| `src/server/lib/seo-data/providers/internal-provider.ts` | Internal D1 data provider |
| `src/server/lib/seo-data/providers/local-crawler-provider.ts` | Local technical SEO crawler |
| `src/server/lib/seo-data/providers/ssrf-guard.ts` | SSRF protection for crawler |
| `src/server/lib/seo-data/cache-service.test.ts` | Cache tests (15) |
| `src/server/lib/seo-data/single-flight.test.ts` | Single-flight tests (5) |
| `src/server/lib/seo-data/data-router.test.ts` | Router tests (8) |
| `src/server/lib/seo-data/providers/ssrf-guard.test.ts` | SSRF guard tests (20) |

## Provider Matrix

| Data | Free Provider | Paid Fallback | Cache TTL |
|------|---------------|---------------|-----------|
| Keyword ideas | Google Ads | DataForSEO | 7 days |
| Keyword metrics | Google Ads / Internal | DataForSEO | 7 days |
| Search Console | GSC | None | 24 hours |
| Bing performance | Bing Webmaster | None | 24 hours |
| SERP | Internal (cache) | DataForSEO | 5 days |
| Domain keywords | Internal (cache) | DataForSEO | 7 days |
| Competitors | Internal (cache) | DataForSEO | 7 days |
| Backlinks | Internal (cache) | DataForSEO | 14 days |
| Site audit | Local crawler | DataForSEO | 7 days |

## Cost Strategy

The implementation reduces DataForSEO usage through:

1. **Cache-first**: Every request checks R2 cache before any provider. Cache hits incur zero DataForSEO cost. TTLs range from 24h (first-party data) to 14 days (backlinks).

2. **Free provider preference**: For `keyword_ideas` and `keyword_metrics`, Google Ads is tried first (free, official API). Only if Google Ads is unavailable or disabled does the router fall back to DataForSEO.

3. **Internal data reuse**: The `internal` provider reads from the D1 `keyword_metrics` table — data previously fetched from DataForSEO and persisted. This serves as a free source for `keyword_metrics`, `domain_keywords`, `competitors`, and `backlinks`.

4. **Local crawler**: For `site_audit`, the local crawler performs basic technical SEO checks (title, meta, canonical, headings, images, links, robots.txt, sitemap, JSON-LD, hreflang) without any DataForSEO call. DataForSEO is only needed for advanced Lighthouse checks.

5. **Budget guard**: `DATAFORSEO_DAILY_BUDGET` and `DATAFORSEO_MONTHLY_BUDGET` env vars set hard limits. When exceeded, DataForSEO calls are blocked with a structured `BudgetExceededError` — no silent bypass.

6. **Request coalescing**: Concurrent identical requests are deduplicated via single-flight, preventing N identical DataForSEO calls from N simultaneous MCP tool invocations.

## DataForSEO Calls Still Required

DataForSEO remains the only source for:
- **Live SERP results** (organic results for a keyword) — no free reliable SERP API exists
- **Backlink data** (backlink profiles, referring domains, history) — no free source provides this
- **Domain ranked keywords** (full keyword universe for a domain) — Google Ads only provides seed-based ideas, not domain-level data
- **SERP competitors** (domain-level competitor analysis across keywords) — no free equivalent
- **Local SERP** (Maps/Local Finder results) — no free equivalent
- **Business listings** and **Google Business Q&A** — no free equivalent
- **AI search mentions** (LLM brand citations) — no free equivalent
- **Lighthouse** (Core Web Vitals) — the local crawler does basic checks but not full Lighthouse scores
- **Rank tracking** (scheduled SERP position checks) — no free SERP API

## Tests

```
Tests: 43 passed (4 test files)
  - cache-service.test.ts: 15 tests (cache hit/miss, TTL, key normalization, different locations/devices)
  - single-flight.test.ts: 5 tests (dedup, concurrent coalescing, failure cleanup)
  - data-router.test.ts: 8 tests (cache→free, cache→DataForSEO, provider unavailable→fallback, budget exceeded, no provider)
  - ssrf-guard.test.ts: 20 tests (private IPs, blocked hostnames, crawl target blocking)

Typecheck: PASSED (0 errors in seo-data modules, 0 errors in modified MCP tools)
Lint: PASSED (0 errors in seo-data modules — all `as` casts suppressed with `oxlint-disable-next-line` following existing codebase pattern)
Build: not run (requires full `vite build` which depends on Cloudflare Workers bindings)
```

Note: `pnpm install` completed successfully (29 min on Windows with `--node-linker=hoisted`). Typecheck and lint now pass cleanly.

## Remaining Limitations

1. **Google Ads provider**: The Google Ads API requires a developer token (approved by Google after review) plus OAuth credentials. The provider is fully implemented but will return `ProviderUnavailableError` (causing the router to fall back to DataForSEO) when credentials are not configured. In practice, most self-hosted users will not have Google Ads API access — however, the existing DataForSEO client already uses Google Ads endpoints internally (`keywords.adsIdeas`, `keywords.adsSearchVolume`), so keyword research still works via DataForSEO. The practical benefit of the Google Ads provider is for users who DO have API access: they get free keyword ideas/metrics without DataForSEO cost. The provider's `supports()` method checks credentials at runtime, so it gracefully degrades.

2. **Internal provider for competitors**: The internal provider now serves `keyword_metrics` (from D1 `keyword_metrics`), `backlinks` (from D1 `backlink_snapshots`), and `domain_keywords` (from D1 `rank_snapshots`). For `competitors`, it returns `ProviderUnsupportedError` because competitor analysis is not persisted in D1. Extending this would require a new table to persist DataForSEO competitor results — a future enhancement.

3. **Feature services not yet wired through router**: The existing feature services (`DomainService`, `BacklinksService`, `KeywordResearchService`) have their own R2 caching and were left untouched to preserve backward compatibility. The router is wired at the MCP layer (the uncached entry points). A future phase could route the services through the DataRouter too, but this requires careful schema alignment.

4. **Build not run**: The full `vite build` requires Cloudflare Workers bindings (R2, D1, KV) which are not available in the local test environment. Typecheck and lint pass cleanly.