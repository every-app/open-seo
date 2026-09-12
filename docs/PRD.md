# OpenSEO — Product Requirements Document (PRD)

> Open source alternative to Semrush and Ahrefs

| Field | Value |
| --- | --- |
| Product | OpenSEO |
| Version | 0.1.3 |
| Status | Live (hosted at [openseo.so](https://openseo.so) + self-hostable) |
| Doc status | Living document — reflects the shipped product |
| Audience | Maintainers, contributors, and agents working on this repo |

---

## 1. Overview

### 1.1 Problem

Professional SEO tools (Semrush, Ahrefs) are expensive, subscription-locked, and bloated. Independent operators, small teams, and AI-agent workflows either pay for suites they barely use or go without SEO data entirely. There is no credible, self-hostable, pay-as-you-go SEO platform designed for both humans and AI agents.

### 1.2 Solution

OpenSEO is an all-in-one, open-source SEO platform with two defining properties:

1. **Pay-as-you-go data** — bring your own DataForSEO API key and pay only for what you use. No subscription required to self-host.
2. **AI-first** — every workflow is exposed through an MCP server and reusable Agent Skills, so AI agents (Claude Code, OpenClaw, Hermes, or the in-app agent) operate the same SEO data humans do.

A hosted version exists for users who don't want to self-host; it charges ~28% over DataForSEO cost per request.

### 1.3 Goals

- Give individuals and small teams Semrush/Ahrefs-class SEO workflows at a fraction of the cost.
- Be the best-in-class SEO tool for AI agents (MCP, Agent Skills, in-app agent).
- Keep the product forkable: users can vibe-code their own custom tool on top of it.
- Minimize paid API spend through a cache-first, free-first data architecture.

### 1.4 Non-goals

- Full feature parity with Semrush/Ahrefs (focused workflows over a bloated suite).
- Building our own global search index / crawler fleet — we aggregate first-party and third-party data instead.
- Enterprise team management / SSO-heavy workflows (self-host users can use Cloudflare Access).

---

## 2. Users & Personas

| Persona | Description | Primary need |
| --- | --- | --- |
| **Indie site owner** | Runs 1–5 sites solo, budget-sensitive | Affordable rank tracking, audits, keyword research |
| **SEO freelancer / consultant** | Manages client sites, needs client-ready reports | Multi-project workflows, white-labelable self-host |
| **AI-agent power user** | Works via Claude Code / OpenClaw / Hermes daily | MCP tools and skills that return structured SEO data |
| **Self-hoster / hacker** | Wants control over data and costs | Docker or Cloudflare deployment, BYO API keys |
| **Hosted subscriber** | Doesn't want to self-host; $10/mo support tier | Zero-setup access to the same product |

---

## 3. Core Workflows (Feature Set)

### 3.1 Projects

The unit of organization. All SEO data is scoped to a project (a target domain). Projects have settings, including AI agent configuration overrides.

### 3.2 Keyword Research

- Keyword discovery with volume, difficulty, intent, and CPC via DataForSEO (with Google Ads free-provider path).
- SERP results inspection per keyword.
- **Saved keywords**: persist, tag, and export promising terms; listable via MCP.

### 3.3 Rank Tracking

- Per-project rank tracking configs (`rank-tracking/$configId`), scheduled snapshots, history, and movement deltas.
- Seeding utility for demo/dev (`seed:rank-tracking`).

### 3.4 Competitor Insights / Domain Analysis

- Domain overview: key metrics for any domain.
- Domain keyword suggestions (what a domain ranks for / could target).
- Brand lookup workflow.
- SAM (competitive analysis view, `sam.tsx`).

### 3.5 Backlinks

- Backlinks overview and full profile per domain/project.
- Cost-profiling scripts to keep paid usage predictable (`billing:backlinks`).

### 3.6 Site Audits

- Local crawler performs free technical SEO checks: title, meta description, canonical, headings, links, JSON-LD, hreflang — no DataForSEO needed.
- Crawl results with per-issue drill-down (`audit/issues/$resultId`).
- Lighthouse integration (PageSpeed/CWV data path).

### 3.7 Search Performance (GSC / Bing)

- Google Search Console integration: free first-party search performance data (clicks, impressions, CTR, position).
- Bing Webmaster as an additional free provider.
- Search tabs UI for cross-source exploration.

### 3.8 AI Visibility / AI Search

- AI search visibility workflows: track how the project domain appears in AI-driven search surfaces.
- Prompt explorer for AI visibility queries.

### 3.9 In-App AI Agent (SAM)

- SEO agent running in a Cloudflare Durable Object via `@cloudflare/think`.
- Calls the same shared MCP tool handlers in-process (never over HTTP, never directly against DataForSEO).
- Multi-provider model support: openrouter, openai, gemini, anthropic, and OpenAI-compatible endpoints (incl. Ollama Cloud).
- Configuration cascade: Project row → Organization row → Environment → Built-in defaults.
- Encrypted per-provider credentials (AES-GCM, key never exposed to browser; masked UI with Change/Remove).
- Bounded agent loops, tool-call deduplication, workflow presets.
- Onboarding chat agent for first-run guidance.

### 3.10 MCP Server & Agent Skills

- OAuth-protected MCP server exposing all major workflows as tools (see `src/server/mcp/tools/`): projects, domain overview, keyword research, SERP, rank tracker, backlinks overview/profile, saved keywords, Search Console, site audit, whoami.
- Pre-built Agent Skills published for external agents; users can build their own.
- Tool outputs are structured and validated (Zod output schemas + text output formatting).

### 3.11 Billing / Usage

- Budget guards: `DATAFORSEO_DAILY_BUDGET`, `DATAFORSEO_MONTHLY_BUDGET` block paid calls past limits.
- Usage scripts: `billing:usage`, `billing:backlinks`, `billing:brand-lookup`.
- Hosted billing via autumn-js with a $10/mo support subscription.

---

## 4. Free-First Data Architecture (Key Requirement)

All data requests MUST route through, in order:

```
Request → Cache → Free/First-party provider → Internal data → DataForSEO (paid fallback)
```

Requirements:

- **Cache**: every result cached in R2 with per-data-type TTLs (24h–14d).
- **Free providers**: Google Search Console, Google Ads keyword ideas, Bing Webmaster.
- **Local crawler**: free technical audit checks (title, meta, canonical, headings, links, JSON-LD, hreflang).
- **Internal**: previously-fetched data in D1/Postgres (keyword metrics, backlink snapshots, rank snapshots).
- **DataForSEO**: paid fallback ONLY when cache misses and no free provider satisfies the request.
- The app MUST remain usable with `DATAFORSEO_ENABLED=false` for any workflow with a free/internal provider.
- Request coalescing deduplicates concurrent identical requests.
- SSRF protection blocks the local crawler from private/internal IPs.

Reference: `docs/free-first-architecture-audit.md`, `docs/free-first-implementation-report.md`.

---

## 5. Platform & Deployment

### 5.1 Stack

| Layer | Technology |
| --- | --- |
| App framework | TanStack Start (React 19, TanStack Router, Query, Form, Table) |
| Runtime | Cloudflare Workers (workerd) via `@cloudflare/vite-plugin` |
| Databases | D1/SQLite (self-host default) **and** Postgres (hosted), Drizzle ORM, dual-compatible migrations |
| Auth | better-auth (Cloudflare Access mode or local no-auth for self-host) |
| Caching | Cloudflare R2 |
| Agent runtime | Durable Objects, `@cloudflare/think`, AI SDK multi-provider |
| MCP | `@modelcontextprotocol/sdk`, `@cloudflare/workers-oauth-provider` |
| UI | Tailwind v4, DaisyUI, Recharts, lucide-react, sonner |
| Validation | Zod at all trust boundaries |
| IaC/deploy | alchemy (preview, selfhost, hosted-prod stages), wrangler, Docker |
| Testing | Vitest (unit), Playwright (E2E) |
| Quality | oxlint (type-aware), prettier, knip, `tsc --noEmit` |

### 5.2 Deployment Paths

1. **Docker (simple self-host)** — personal use; see `docs/SELF_HOSTING_DOCKER.md`.
2. **Cloudflare (advanced self-host)** — internet-facing, multi-device/team, free plan friendly; see `docs/SELF_HOSTING_CLOUDFLARE.md`.
3. **Hosted** — openseo.so (Postgres stage).

### 5.3 Auth Modes

- `cloudflare_access` — secured deployments behind Cloudflare Access (JWT validation against team domain + AUD).
- `local_noauth` — trusted local self-host only.

---

## 6. UX Principles

- Modern, simple UI; focused workflows instead of a bloated SEO suite.
- Each project page is a focused workspace: Overview, Keywords, Rank Tracking, Backlinks, Audit, AI Search, Saved, Search Performance, Brand Lookup, Prompt Explorer, Settings.
- AI agent surfaces (in-app chat) share the same tool contract as external MCP agents.
- Plain-language, actionable output — reports a non-SEO can act on.

---

## 7. Success Metrics

| Metric | Signal |
| --- | --- |
| Self-host installs (Docker + Cloudflare) | Community adoption |
| Hosted subscription conversions ($10/mo) | Willingness to support the project |
| MCP tool invocations by external agents | AI-first thesis validation |
| DataForSEO spend per active project | Free-first routing effectiveness (lower = better) |
| Cache hit rate / paid-call avoidance rate | Architecture health |
| Contributor activity (PRs, skills published) | Open-source health |

---

## 8. Requirements Summary

### 8.1 Functional requirements

- FR-1: Users can create projects scoped to a domain and manage per-project settings.
- FR-2: Keyword research, SERP inspection, and saved-keyword workflows operate end-to-end.
- FR-3: Rank tracking creates configs, stores snapshots, and reports rank movement over time.
- FR-4: Backlinks overview and profile views are available per project/domain.
- FR-5: Site audit crawls and reports technical issues with per-issue drill-down, without requiring DataForSEO.
- FR-6: GSC (and Bing) search performance data is ingestible and viewable.
- FR-7: All major workflows are exposed as MCP tools with structured, validated output.
- FR-8: The in-app agent (SAM) uses the same MCP handlers in-process, with configurable multi-provider models and encrypted credentials.
- FR-9: Every data request follows the cache → free → internal → paid routing order.
- FR-10: Budget guards and usage reporting keep paid API spend visible and bounded.

### 8.2 Non-functional requirements

- NFR-1: Dual SQLite/Postgres compatibility for all schema changes, queries, and mutations.
- NFR-2: Secrets are never logged, returned in plaintext, or sent to the browser; AI credentials are AES-GCM encrypted with domain separation.
- NFR-3: SSRF protection on all user-supplied URL fetching (local crawler, Lighthouse).
- NFR-4: Type safety end-to-end (`tsc --noEmit`, oxlint type-aware, Zod at boundaries).
- NFR-5: New backend functionality follows TanStack server function → service → repository layering.
- NFR-6: Product data is normalized; relational data is not stored in JSON blobs.

---

## 9. Out of Scope

- Building a proprietary search index.
- Native mobile apps.
- Team seats/roles beyond what Cloudflare Access provides.
- Deep historical databases (e.g., 10-year keyword archives) — we surface what providers give us.

---

## 10. Related Docs

- `README.md` — product overview
- `docs/free-first-architecture-audit.md` — data routing architecture
- `docs/in-app-ai-agent.md` — SAM configuration surface
- `docs/ai-credentials-storage-audit.md` — credential encryption design
- `docs/SELF_HOSTING_DOCKER.md` / `docs/SELF_HOSTING_CLOUDFLARE.md` — deployment guides
- `docs/DATAFORSEO_API_KEY.md` — paid data setup
- `docs/CONTRIBUTING.md` — how to contribute
