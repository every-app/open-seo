# Free-First SEO Data Architecture — Implementation Report

## Implemented

### Phase 0 — Docker/Wrangler Local Dev Environment
- `Dockerfile.dev` (node:22-bookworm + corepack pnpm), `compose.dev.yaml`, `docker-entrypoint.dev.sh`, `.env.docker.example`
- Runs `vite dev` inside the full Cloudflare Workers local runtime (wrangler/vite-plugin-cloudflare): local D1 (migrations applied on boot), local R2, local KV, local DOs/Workflows
- Scripts: `dev:docker`, `dev:docker:down`, `dev:docker:logs`, `dev:docker:reset`
- Verified: `/api/health` 200, homepage SSR 200, `/mcp` initialize 200, 24 MCP tools registered, D1/R2/KV state initialized. See `docs/local-docker-development.md`

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
- `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, `find_serp_competitors`: budget guard added via `assertDataforseoBudget()` before DataForSEO calls (still direct-client; see "DataForSEO Calls Still Required")

### Phase 10 — Feature Services Routed Through DataRouter
All three high-traffic feature services now route through the DataRouter instead of calling `createDataforseoClient` directly and managing their own R2 caches:

- **DomainService** — `getOverview` (`domain_overview`), `getSuggestedKeywords` / `getKeywordsPage` (`domain_keywords` with limit/offset/orderBy/filters/includeSubdomains constraints), `getPagesPage` (`domain_pages`). Service-level R2 cache and `waitUntil` writes removed.
- **BacklinksService** — `profileOverview` (`summary` + `history` calls), `profileBacklinksPage` (`rows`), `profileReferringDomainsPage` (`referring_domains`), `profileTopPagesPage` (`domain_pages`) via `constraints.backlinkCall` with limit/offset/orderBy/filters/mode/spam-option passthrough. Service-level R2 cache removed.
- **KeywordResearchService** — waterfall legs (`related`/`suggestions`/`ideas`/`google_ads` via `keyword_ideas` + `constraints.source`), `getSerpAnalysis` (`serp`), `refreshSavedKeywordMetrics` (`keyword_metrics`, keeping D1 upserts that feed the internal provider). Outer `kw:research` and `serp:analysis` R2 caches removed — the router's per-constraint cache keys cover the waterfall granularity.

Result: these services inherit R2 caching, single-flight coalescing, budget-guard enforcement, and structured cost logging. Router response schemas live in SDK-free modules so the ~3 MB `dataforseo-client` stays behind `loadDataforseoSections()` (see `backlinks-schemas.ts`).

New data types: `domain_overview` and `domain_pages` added to `SEODataType` with 7-day TTLs and provider support in the DataForSEO provider (`routeDomainRequest` honors limit/offset/orderBy/filters/includeSubdomains; `keywordIdeasBySource` honors source/limit/depth/includeClickstreamData).

## Modified Files

| File | Change |
|------|--------|
| `src/server/mcp/tools/get-serp-results.ts` | Replaced direct `createDataforseoClient` with `getSeoDataRouter().route()` |
| `src/server/mcp/tools/dataforseo-research-tools.ts` | Wired `get_ranked_keywords` and `get_keyword_metrics` through DataRouter; added `assertDataforseoBudget()` guard to 4 remaining direct DataForSEO tools |
| `.env.example` | Added all new configuration variables (feature flags, budget guards, provider credentials, cache TTL overrides) |
| `src/server/lib/seo-data/providers/dataforseo-provider.ts` | Granular `constraints` support: `backlinkCall` (summary/history/rows/referring_domains/domain_pages), keyword-idea `source` (ideas/suggestions/related/google_ads), domain labs pagination |
| `src/server/lib/seo-data/types.ts` / `config.ts` / `data-router.ts` | Added `domain_overview` + `domain_pages` data types, 7-day TTLs, provider priorities |
| `src/server/features/domain/services/DomainService.ts` + `domainKeywordsPage.ts` + `domainPagesPage.ts` | Routed through DataRouter; removed service R2 cache |
| `src/server/features/backlinks/services/backlinksServiceData.ts` + `BacklinksService.ts` | Routed through DataRouter; removed service R2 cache |
| `src/server/features/keywords/services/research/*` | Routed through DataRouter; removed `kw:research`/`serp:analysis` R2 caches; D1 persistence kept |
| `src/server/lib/dataforseo/backlinks-schemas.ts` | New SDK-free home for backlinks response zod schemas (keeps SDK out of the eager worker graph) |
| `scripts/backlinks-cost-profile.ts` | Updated for cache-less service factory |
| `Dockerfile.dev`, `compose.dev.yaml`, `docker-entrypoint.dev.sh`, `.env.docker.example` | Local Docker/Wrangler dev environment |

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
| Domain overview | Internal (cache) | DataForSEO | 7 days |
| Domain pages | Internal (cache) | DataForSEO | 7 days |
| Competitors | Internal (cache) — not persisted | DataForSEO | 7 days |
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
Full suite: 835 passed (100 test files)
seo-data modules: 43+ passed
  - cache-service.test.ts: 15 tests (cache hit/miss, TTL, key normalization, different locations/devices)
  - single-flight.test.ts: 5 tests (dedup, concurrent coalescing, failure cleanup)
  - data-router.test.ts: 8 tests (cache→free, cache→DataForSEO, provider unavailable→fallback, budget exceeded, no provider)
  - ssrf-guard.test.ts: 20 tests (private IPs, blocked hostnames, crawl target blocking)

Typecheck: PASSED (0 errors)
Lint: PASSED (0 errors, oxlint --type-aware)
Build: PASSED (vite build + tsc; SDK stays behind the lazy loadDataforseoSections boundary)
Docker: PASSED (compose config + build + up; /api/health, homepage SSR, /mcp initialize all 200; D1 migrations applied; R2/KV state initialized)
```

Note: `pnpm install` completed successfully (29 min on Windows with `--node-linker=hoisted`). Typecheck and lint now pass cleanly.

## Remaining Limitations

1. **Google Ads provider**: The Google Ads API requires a developer token (approved by Google after review) plus OAuth credentials. The provider is fully implemented but will return `ProviderUnavailableError` (causing the router to fall back to DataForSEO) when credentials are not configured. In practice, most self-hosted users will not have Google Ads API access — however, the existing DataForSEO client already uses Google Ads endpoints internally (`keywords.adsIdeas`, `keywords.adsSearchVolume`), so keyword research still works via DataForSEO. The practical benefit of the Google Ads provider is for users who DO have API access: they get free keyword ideas/metrics without DataForSEO cost. The provider's `supports()` method checks credentials at runtime, so it gracefully degrades.

2. **Competitor D1 persistence (intentionally deferred)**: Competitors currently remain DataForSEO-backed and benefit from DataRouter caching and budget protection. The internal provider returns `ProviderUnsupportedError` for `competitors` because competitor analysis is not persisted in D1. D1 competitor snapshot persistence is a future enhancement — it would require a new table (e.g. `competitor_snapshots`) plus write-through persistence in the DataForSEO provider so a subsequent request for the same keyword set hits the internal provider for free.

3. **Direct-client MCP tools**: `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, and `find_serp_competitors` still call `createDataforseoClient` directly (with the budget guard). Routing them through the DataRouter would require new data types (`business_listings`, `local_serp`, `business_questions`) — a future enhancement.

## Phase K — Route Remaining Paid Bypasses Through DataRouter

Four consumers that previously bypassed the DataRouter now route through it, inheriting cache-first, free-provider preference, single-flight coalescing, and budget guarding. All four are fully tested, lint-clean, and committed on `feature/free-first-seo`:

### K1 — Rank-tracking metric refresh (`db12d89`)
`RankTrackingService.refreshKeywordMetrics` no longer builds a DataForSEO client; it calls `router.route({ dataType: "keyword_metrics", ... })` with `creditFeature: "rank_tracking"` and `constraints.locationName`.

- **google-ads-provider**: gated to Google Ads markets via `getKeywordDataProvider(locationCode) === "google_ads"` (throws `ProviderUnsupportedError` for `constraints.locationName`); output normalized to `KeywordMetricRow` (`result.keyword ?? result.text`, month mapping via `monthNumberFor`) so the service contract is unchanged.
- **internal-provider**: succeeds only when D1 covers the full requested keyword set; otherwise falls back so paid markets still get fresh metrics.
- **dataforseo-provider**: passes `locationName` through for `keyword_metrics` calls.
- Tested: RankTrackingService (9), internal-provider (10), dataforseo-provider (8).

### K2 — Onboarding market data (`9b749a8`)
`onboardingMarketTools` routes `get_serp_results` through the `serp` data type (`constraints` carry keyword/location/language; `creditFeature: "onboarding"`) and `find_serp_competitors` through `competitors` with `constraints: { projectId, limit: 50 }`; `createDataforseoClient` removed from the onboarding `ToolContext` (`onboardingChatTools`). Tested: `onboardingMarketTools.test.ts` (4), including per-keyword failure isolation.

### K3 — Dashboard backlink refresh coalescing (`aee7444`)
`DashboardService.ensureBacklinkSnapshot` routes through the `backlinks` data type (`dataType: "backlinks"`, `domain`, `creditFeature: "backlinks"`, `constraints: { projectId, backlinkCall: "summary" }`). The router's single-flight coalesces concurrent dashboard refreshes into one upstream call.

- Snapshot insert only when the router actually paid DataForSEO (`provider === "dataforseo"`) or when no row exists yet (materializing cached data) — cached/internal refreshes over existing rows do NOT re-insert, so the dashboard's stale badge reflects real capture age.
- 24h `SNAPSHOT_MAX_AGE_MS` early-return gate and stale-snapshot-on-provider-error behavior preserved.
- Tested: `DashboardService.test.ts` (7).

### K4 — Lighthouse read-through cache (`3713b16`)
`fetchAndStoreLighthouseResult` dropped its 3-attempt direct-client retry loop for a single `router.route({ dataType: "site_audit", device, constraints: { lighthouse: true } })` attempt — retrying around the router would multiply paid calls. Successful results are cached (7d `site_audit` TTL); failures are not cached and return a null-score result with `errorMessage` (no R2 write).

- The `site_audit` provider priority is `["local_crawler", "dataforseo"]`; `local-crawler-provider.supports()` now returns `false` when `constraints.lighthouse === true`, so Lighthouse requests fall through to DataForSEO instead of silently receiving free crawl-check payloads. The cache key includes constraints, so crawl-check and Lighthouse payloads never collide.
- Tested: `lighthouse.test.ts` (5), `local-crawler-provider.test.ts` (3).

### Follow-up (`f0d3332`)
Silenced 4 oxlint findings in the new test files (vitest asymmetric-matcher and ToolSet-narrowing assertion patterns, matching the existing `oxlint-disable` convention).

### Phase K validation
```
Full suite: 901/903 passed (107/108 files) — the 2 failures were load artifacts in
  the untouched client.test.ts metering file (5000ms timeout + shared-state contention
  under single-worker memory pressure); the file passes 21/21 in isolation.
New/focused tests: RankTrackingService 9, internal-provider 10, dataforseo-provider 8,
  onboardingMarketTools 4, DashboardService 7, lighthouse 5, local-crawler-provider 3
Typecheck: PASSED (0 errors)
Lint: PASSED (oxlint --type-aware, 0 errors)
Build: PASSED (vite client + SSR + tsc)
Docker: PASSED (compose config; pulled published image, container healthy;
  /api/health 200, homepage SSR 200, /mcp initialize returns valid JSON-RPC with tools capability)
Direct createDataforseoClient verified absent from all four targeted areas.
```

### DataForSEO calls still required (unchanged by Phase K)
- Backlinks detail endpoints via `backlinksServiceData` (`history`, `rows`, `referring_domains`, `domain_pages`) — already router-routed, still paid when cache/internal miss.
- MCP `dataforseo-research-tools` remaining direct tools (business listings, local SERP, business questions — plus the budget-guarded direct calls).
- AI-search `brandLookup` / `promptExplorer`.
- Rank-check workflows (`rankCheckPaths`, `RankCheckWorkflow`) — scheduled SERP position checks.

### Future opportunities (explicitly out of Phase K scope)
- Route local business listings / local SERP / business questions through new data types (needs new providers).
- D1 persistence for `serp` snapshots (per-keyword) and `domain_keywords` rows, making the internal provider a free source for repeats.
- Persistent budget accounting per organization (currently in-memory counters).
- Route rank-check workflow collection through the `serp` data type with D1-backed snapshots.

## Phase O — In-App AI Agent Configuration

Phase O extends the existing SAM agent (no second agent stack) with a
configurable AI provider/model surface, bounded loops, tool-call dedup, site
audit tools, workflow presets, tests, and docs. See
`docs/in-app-ai-agent.md` for the full guide.

### O1 — AI settings schema
- New `ai_agent_settings` table in both `src/db/sam.schema.ts` and
  `src/db/pg/sam.schema.ts`: `provider` (default `'openrouter'`), `model`
  (default `''` = unset/inherit), nullable `organization_id`/`project_id` FKs
  with cascade delete, `updated_at`.
- Partial unique indexes (`ai_agent_settings_org_idx`,
  `ai_agent_settings_project_idx`) enforce one row per scope.
- D1 migration `drizzle/0039_ordinary_azazel.sql` (journal repaired — the
  prior file deletions left dangling entries); PG `drizzle-pg/0016_sloppy_cargill.sql`
  (table + FKs) + `0017_mute_joshua_kane.sql` (indexes). Schema-parity test
  suite passes (132 tests).

### O2 — Settings service + repository
- `AiSettingsRepository` (org/project get/upsert; project row with a cleared
  model deletes the row = inherit; empty model normalized to null).
- `AiSettingsService` — model resolution order: project → organization →
  `AI_AGENT_MODEL` → `OPENROUTER_MODEL` → built-in default
  (`minimax/minimax-m3`). `maskApiKey` for UI status display. Credentials
  never touch the database or the client.

### O3 — Provider abstraction
- `AiProvider` interface + `AiProviderRegistry` (`src/server/features/ai/providers.ts`);
  OpenRouter is the only provider this phase. `listModels` reads the public
  OpenRouter catalog, normalizes pricing/tool-support, and caches in R2 for
  12h (`CACHE_TTL.aiModels = 43200`). `testConnection` fires a minimal
  `generateText` and classifies failures (401/403 → invalid key, 404 → model
  unavailable, else unreachable).

### O4 — SAM agent hardening
- `SamChatAgent.beforeTurn` resolves DB settings via the repository +
  `resolveAiModel`, applies `AI_AGENT_MAX_STEPS` (default 48) and a
  `toolCallCap` stop condition (`AI_AGENT_MAX_TOOL_CALLS`, default 24) that
  ends the turn at the cumulative tool-call bound — the primary cost guard.
- `samToolExecution.ts`: per-conversation dedup cache (64 entries, keyed by
  `tool:args`, successful outputs only, errors never cached) + structured
  `sam-tool` log lines.
- `samChatTools.ts`: tool adapter wired to the tracker; four site-audit tools
  added to the SAM toolset (`run_site_audit`, `get_audit_status`,
  `get_audit_issues`, `get_audit_pages`) by adapting the existing MCP
  definitions.
- `samSystemPrompt.ts`: prompt-injection guidance (tool outputs are untrusted)
  and cost policy (reuse fetched data).

### O5 — Server functions
- `src/serverFunctions/aiSettings.ts`: `getGlobalAiSettings`,
  `updateGlobalAiSettings`, `getProjectAiSettings`, `updateProjectAiSettings`,
  `listAiModels`, `testAiConnection`.

### O6 — Settings UI
- Global AI agent section on the Settings page (`AiSettingsSection`):
  provider, model picker (filterable, price/context/tool-support display),
  masked key status, connection test, save.
- Project override section on project settings (`ProjectAiSettingsSection`)
  with an inherit toggle.
- SAM empty state gained five workflow presets (opportunity analysis,
  commercial keyword research, competitor analysis, technical SEO, executive
  plan) alongside the quick-question chips.

### O7 — Env/docs/tests
- `AI_AGENT_MODEL`, `AI_AGENT_MAX_STEPS`, `AI_AGENT_MAX_TOOL_CALLS` added to
  `env.d.ts`, `alchemy.run.ts`, all `.env*.example` files, `compose.yaml`, and
  `compose.dev.yaml` (which also passes `OPENROUTER_API_KEY` through).
- New tests: providers (catalog parse/caching/failure classification — 7),
  settings resolution + key masking (7), tool dedup + event logging (2),
  env parsing + tool-call counter (3).

### Phase O validation
```
Full suite: 975 passed (112 files)
Typecheck: PASSED (0 errors)
Lint: PASSED (oxlint --type-aware, 0 errors)
Build: PASSED (vite build + tsc)
```

### Phase O known gaps / follow-ups
- Live E2E of a real SAM turn requires a valid `OPENROUTER_API_KEY` in the
  deployment environment (the container currently runs without one; SAM
  responds with the billing/configuration notice in that state).
- Second provider support (e.g. Anthropic/OpenAI directly) is possible but
  intentionally deferred — the `AiProvider` interface is the seam.