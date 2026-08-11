# Free-First SEO Data Architecture — Audit

## 1. Current Architecture

OpenSEO is a Cloudflare Workers app (Vite + TanStack Start + React 19) backed by D1/Postgres (Drizzle ORM) and R2/KV. SEO data flows:

```
TanStack server function → feature service → DataForSEO client (metered)
                                       ↑ R2 cache (some services)
```

The DataForSEO client (`src/server/lib/dataforseo/client.ts`) is a single metered boundary wrapping the `dataforseo-client` SDK. Every call goes through `meterDataforseoCall` which handles billing/credits in hosted mode. A GSC client (`src/server/lib/gscClient.ts`) exists for first-party Search Console data but is **not** wired as an alternative to any DataForSEO call — the two serve disjoint data types.

## 2. DataForSEO Integration Points

### Direct `createDataforseoClient` call sites in feature/workflow code

| # | File | Methods called | Data type | R2 cached? |
|---|------|---------------|-----------|------------|
| 1 | `features/keywords/services/research/research-data.ts` | `keywords.related`, `keywords.suggestions`, `keywords.ideas`, `keywords.adsIdeas` | keyword_ideas / related / suggestions | Yes (in `research.ts`, 24h) |
| 2 | `features/keywords/services/research/serp.ts` | `serp.live` | serp | Yes (12h) |
| 3 | `features/keywords/services/research/refresh-metrics.ts` | `fetchKeywordMetricsForList` | keyword_metrics | No (persists to D1) |
| 4 | `features/backlinks/services/backlinksServiceData.ts` | `backlinks.summary`, `.history`, `.rows`, `.referringDomains`, `.domainPages` | backlinks | Yes (6h) |
| 5 | `features/domain/services/DomainService.ts` | `domain.rankOverview`, `domain.rankedKeywords` | domain_overview / domain_keywords | Yes (12h) |
| 6 | `features/domain/services/domainKeywordsPage.ts` | `domain.rankedKeywords` | domain_keywords | Yes (12h) |
| 7 | `features/domain/services/domainPagesPage.ts` | `domain.relevantPages` | domain_pages | Yes (12h) |
| 8 | `features/ai-search/services/brandLookup.ts` | `aiSearch.aggregatedMetrics`, `.topPages`, `.mentionsSearch`, `.crossAggregatedMetrics` | ai_search | Yes (24h) |
| 9 | `features/ai-search/services/promptExplorer.ts` | `aiSearch.llmResponse` | ai_search | Yes (7d) |
| 10 | `features/dashboard/services/DashboardService.ts` | `backlinks.summary` | backlinks_summary | D1 snapshot (not R2 cache) |
| 11 | `features/onboarding/onboardingMarketTools.ts` | `serp.live`, `labs.serpCompetitors` | serp / competitors | **No** |
| 12 | `features/rank-tracking/services/RankTrackingService.ts` | `fetchKeywordMetricsForList` | keyword_metrics | No (persists to D1) |
| 13 | `workflows/RankCheckWorkflow.ts` → `rankCheckPaths.ts` | `serp.rankCheck`, `serp.rankCheckTaskPost` | rank_tracking | No (snapshots to D1) |
| 14 | `lib/audit/lighthouse.ts` | `lighthouse.live` | site_audit | R2 object store (not r2-cache) |

### MCP tools calling DataForSEO directly (bypassing service cache)

| File | Tools | Cached? |
|------|-------|---------|
| `mcp/tools/get-serp-results.ts` | `get_serp_results` | **No** |
| `mcp/tools/dataforseo-research-tools.ts` | `get_ranked_keywords`, `find_serp_competitors`, `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, `get_keyword_metrics` | **No** |

All other MCP tools delegate to feature services which own their own cache.

## 3. Existing Cache

### R2 cache (`src/server/lib/r2-cache.ts`)
- `buildCacheKey(prefix, params)` — SHA-256 over JSON-sorted params → `${prefix}:${hash}`
- `getCached(key)` — reads `dataforseo-cache/${key}`, checks `customMetadata.expiresAt`
- `setCached(key, data, ttlSeconds)` — writes JSON with soft TTL metadata
- `CACHE_TTL.researchResult` = 86400s (the only shared constant; all other TTLs are local)

### Consumers and TTLs
| Service | Prefix | TTL |
|---------|--------|-----|
| KeywordResearchService | `kw:research` | 24h |
| KeywordResearchService (serp) | `serp:analysis` | 12h |
| DomainService (overview) | `domain:overview` | 12h |
| DomainService (suggestions) | `domain:keyword-suggestions` | 12h |
| domainKeywordsPage | `domain:keywords-page` | 12h |
| domainPagesPage | `domain:pages-page` | 12h |
| BacklinksService (overview) | `backlinks:overview` | 6h |
| BacklinksService (tabs) | `backlinks:*-page` | 6h |
| brandLookup | `ai-search:brand-lookup` | 24h |
| promptExplorer | `ai-search:prompt-response` | 7d |

### KV cache
- `serp-locations:{iso}` — 30d (SERP locations, free DataForSEO endpoint)
- `ahrefs-dr:{domain}` — 24h (Ahrefs free DR lookup)
- `autumn:customer-ensured:{orgId}` — 24h (billing flag)
- `audit-progress:{auditId}` — 30min (ephemeral live progress)

### DB materialization (not TTL cache)
- `keyword_metrics` table — latest metrics per (project, keyword, location, language)
- `rank_snapshots` — historical rank results
- `backlink_snapshots` — point-in-time backlink summaries

**No `seo_cache` table exists.** No in-memory/LRU result cache. One single-flight dedupe map exists in `serp-locations.ts` (`inflightFills`).

## 4. Database/Storage

- **D1 (SQLite)** default; **Postgres** opt-in via `DATABASE_PROVIDER=postgres`
- Schema barrel: `src/db/schema.ts` (provider-aware cast, parity-guarded by `schema-parity.test.ts`)
- Existing tables relevant to caching: `keyword_metrics`, `rank_snapshots`, `backlink_snapshots`, `audit_lighthouse_results` (R2 key reference)
- Large payloads (Lighthouse) stored in R2 with DB metadata + `r2_key` — precedent for blob offload

## 5. MCP Architecture

- `src/server/mcp/server.ts` — `registerOpenSeoMcpTools(server)` registers 22 tools
- `src/server/mcp/project-auth.ts` — `withMcpProjectAuth` resolves project + billing context
- Tools either delegate to feature services (cached) or call DataForSEO directly (uncached)
- GSC tools (`search-console-tools.ts`) delegate to `GscService` (free, no cache needed)

## 6. Workflow Architecture

- `SiteAuditWorkflow` — crawl phase (local crawler, no DataForSEO) → Lighthouse phase (DataForSEO `lighthouse.live` per page)
- `RankCheckWorkflow` — live/queued SERP checks via DataForSEO, snapshots to D1
- Both use Cloudflare Workflows (durable, step-based)

## 7. Existing Abstractions to Reuse

| Abstraction | Location | Reuse for |
|-------------|----------|-----------|
| R2 cache primitives | `src/server/lib/r2-cache.ts` | CacheService foundation |
| DataForSEO metered client | `src/server/lib/dataforseo/client.ts` | DataForSEO fallback provider |
| GSC client | `src/server/lib/gscClient.ts` | GSC provider |
| Local crawler | `src/server/workflows/site-audit-workflow-helpers.ts` + `lib/audit/` | Local crawler provider |
| `AppError` + error codes | `src/server/lib/errors.ts`, `src/shared/error-codes.ts` | Typed provider errors |
| `runtime-env.ts` | `src/server/lib/runtime-env.ts` | Config/env access |
| `keyword_metrics` table | `src/db/app.schema.ts` | Internal keyword data provider |
| `inflightFills` dedupe | `src/server/lib/dataforseo/serp-locations.ts` | Single-flight pattern reference |

## 8. Recommended Insertion Points

### New code (follows `src/server/lib/` convention)
- `src/server/lib/seo-data/` — provider abstraction, router, cache service, types, errors
  - `types.ts` — `SEODataRequest`, `SEODataResponse`, `SEODataType`, `SEODataProvider`
  - `errors.ts` — `ProviderUnavailableError`, `ProviderUnsupportedError`, `BudgetExceededError`, `AuthenticationError`, `RateLimitError`
  - `cache-service.ts` — centralized cache with per-data-type TTL config
  - `data-router.ts` — `DataRouter` orchestrating cache → free → fallback
  - `providers/` — provider implementations
    - `dataforseo-provider.ts` — wraps existing client + budget guard
    - `gsc-provider.ts` — wraps existing gscClient
    - `google-ads-provider.ts` — direct Google Ads API
    - `bing-webmaster-provider.ts` — Bing Webmaster API
    - `local-crawler-provider.ts` — wraps existing audit crawler
    - `internal-provider.ts` — reads from D1 (keyword_metrics, rank_snapshots)
  - `config.ts` — feature flags + TTL config from env
  - `cost-tracker.ts` — metrics counters
  - `single-flight.ts` — request coalescing
  - `*.test.ts` — tests per module

### Files to modify
- `src/server/mcp/tools/get-serp-results.ts` — route through DataRouter
- `src/server/mcp/tools/dataforseo-research-tools.ts` — route through DataRouter
- `src/server/mcp/server.ts` — register router-backed tools
- `src/env.d.ts` — add new env vars
- `.env.example` / `.env.selfhost.example` — document new config
- `src/shared/error-codes.ts` — add provider error codes (if needed)

### Files to remain untouched
- Feature services that already cache (DomainService, BacklinksService, KeywordResearchService) — they continue working; the router is wired in at the MCP/uncached-call layer first, then gradually at the service layer
- Existing DataForSEO client (`client.ts`) — wrapped, not replaced
- Existing GSC client — wrapped, not replaced
- Existing audit crawler — wrapped, not replaced
- Database schema — no new cache table needed (R2 cache is sufficient and already established)

## 9. Architecture Decision: Why Not a DB Cache Table

The existing R2 cache pattern is well-established, works across both D1 and Postgres, and handles large JSON payloads without bloating the primary database. Adding a `seo_cache` table would duplicate the R2 cache layer and require schema parity maintenance. Instead, the `CacheService` will extend `r2-cache.ts` with centralized TTL configuration and per-data-type key namespacing.

## 10. Phased Plan

1. **Audit** (this document)
2. **Provider abstraction** — types, errors, cache service, router, single-flight, cost tracker + tests
3. **Cache-first routing** — wire uncached MCP tools through router
4. **GSC provider** — wrap existing gscClient
5. **Google Ads provider** — direct API implementation
6. **Bing Webmaster provider** — API implementation
7. **Local crawler provider** — wrap existing audit crawler for standalone technical SEO
8. **DataForSEO fallback** — budget guard, batching, cost tracking, fallback logging
9. **MCP integration** — all MCP tools use DataRouter
10. **Documentation** — README, .env.example, developer docs, final report

## Status (updated after Phase F)

This document is the Phase-1 audit/planning artifact. Implementation status and the live architecture are tracked in `docs/free-first-implementation-report.md`.

Notable divergences from the plan above:

- **"Files to remain untouched" (section 8) is superseded**: `DomainService`, `BacklinksService`, and `KeywordResearchService` have since been routed through the DataRouter (their service-level R2 caches removed). Their data types now include `domain_overview` and `domain_pages` in addition to the original nine.
- The router gained granular constraint support for backlinks (`constraints.backlinkCall`), keyword-idea sources (`constraints.source`), and domain-labs pagination (limit/offset/orderBy/filters/includeSubdomains).
- Four MCP tools (`search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, `find_serp_competitors`) still call the DataForSEO client directly, behind the budget guard — see "Remaining Limitations" in the implementation report.