# Agent guidance

## Feature log

- 2026-09-04: Added Bing Webmaster query-stat fallback to `get_domain_keyword_suggestions` when DataForSEO authentication is unavailable. Bing rows expose clicks and intentionally leave search volume, position, CPC, and difficulty null; output includes a provider limitation note. Typecheck/biome passed; Vitest invocation hung in this environment. Commit `894fe40` pushed to `Noesis-Boss/open-seo`.

- 2026-09-03: Added related-query extraction to `search_google_trends`, with fixture coverage for ranked related terms. Timeline behavior remains unchanged; type-check, formatting, and 2/2 adapter tests pass. Local commit `5a62ae1`; push to upstream is blocked because `Noesis-Boss` has no write access to `every-app/open-seo.git`.
- 2026-09-03: Added `search_google_trends` MCP support through `src/server/lib/google/trends.ts`. Results are labeled as relative-interest-index signals, not search volume. Existing Google Ads/Keyword Planner-compatible DataForSEO routing remains available; direct Google Ads collection is not substituted because of Google policy constraints. Type-check and formatting validation pass.

## Engineering principles

- Prefer simple, readable, flat code with minimal indirection.
- Search for existing implementations and installed libraries before creating new helpers or abstractions.
- Abstract when it prevents meaningful drift and makes the result simpler to maintain. Avoid speculative or one-use abstraction layers.
- Keep product data normalized and relationships explicit. Do not encode relational data in JSON or text merely to avoid joins.
- For new application-backed backend functionality, default to: TanStack server function → service → repository.
- Keep schema changes, queries, and mutations compatible with both SQLite and Postgres.
- Use idiomatic TypeScript. Use Zod to validate untrusted data and narrow runtime values at trust boundaries.
- Prefer established project helpers and libraries over hand-rolled implementations.
- Prefer idiomatic TanStack Query, Router, and Form patterns for server state, routing, and submitted forms.

## Log papercuts

When small, non-blocking repository friction occurs—a retried tool call, confusing setup step, flaky command, stale cache, misleading error, or non-obvious gotcha—use the `papercuts` skill and append it to `.agents/PAPERCUTS.md` in the moment. Continue the current task. Real bugs and tracked work are not papercuts, and sensitive data must never be logged.

Do not mine an entire session for papercuts or start a broad cleanup unless the user explicitly asks.

## Preserve review learnings

After a merge-ready or other code review verifies a finding, use `maintain-greptile-rules` only when the finding exposes a recurring or high-risk repository invariant that existing `.greptile/` context and automated checks do not capture. Do not promote one-off bugs or preferences into permanent review rules.

Changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` alter the review control plane and must receive explicit maintainer review. CODEOWNERS requests that review; where repository settings allow, enable GitHub's requirement for code-owner approval. Repository-specific rules live in `.greptile/`; maintainers should configure or retain a minimal org-enforced Greptile baseline for external-contribution, secret, authentication, billing, CI, and rule-tampering risks. Agents should report an unverified or missing baseline and must not mutate dashboard or organization rules without explicit user authorization.
- 2026-09-04: Completed DataForSEO-free keyword research migration. Keyword path runs through Google Ads / Bing Webmaster adapters with auto-fallback; surfaces with no connector equivalent now degrade to recognized `DATAFORSEO_AUTH_FAILED` errors instead of anonymous 500s when `DATAFORSEO_API_KEY` is absent (core.ts, commit `77bdbcc`). Remaining DataForSEO-backed surfaces (backlinks, SERP, AI search, rank tracking, lighthouse) throw the config error cleanly but still need connector equivalents.
- 2026-09-04: Step 3 done. Added `src/server/lib/keyword-providers/bing-site.ts` (Bing Webmaster `GetUserSites`/`GetLinkCounts`/`GetQueryStats` adapter) and wired `get_domain_overview` to fall back to Bing Webmaster link/query data when DataForSEO is unconfigured (commit `053d03c`). Push succeeded to origin/main. Pre-existing dataforseo `backlinks.test.ts`/`business.test.ts` failures (5 tests) exist on clean main and are unrelated.
- 2026-09-04: Both remaining Bing fallbacks done (commit `e9a5459`). Refactored `bing-site.ts` around a shared `getBingSiteData(domain)` helper (`getBingPartialOverview` now wraps it; get-domain-overview unchanged). `get_ranked_keywords` degrades to Bing Webmaster query stats (keyword/impressions/clicks/ctr rows, labeled as not search volume) on `DATAFORSEO_AUTH_FAILED`; `get_backlinks_overview` degrades to Bing link counts + top referrer sources with provider notes in text and `scopeNote`. Both rethrow the original config error when Bing is unavailable too. Added fixture tests: 2 in `dataforseo-research-tools.test.ts`, 2 in new `get-backlinks-overview.test.ts`; tsc, biome, and 42 affected tests pass. Bing data requires the domain to be registered in Bing Webmaster Tools.
