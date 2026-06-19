# Onboarding agent — implementation plan (chat + seed function)

## Status

Accepted (June 2026) — technical plan for `specs/0005-onboarding-agent.md`.

Supersedes an earlier draft that proposed Cloudflare Project Think + Durable
Objects + a Workflow. We dropped all of that (see "Why not Think / Workflows").

> **Update (June 2026):** the shipped implementation diverged from the plan
> below. The deterministic seed + synthesis pipeline — and its `claimRun`
> run-status guard and `skipBalanceAssert` bypass — was replaced by an on-demand
> chat: Sam calls two tools (`read_website`, `get_seo_metrics`) and writes the
> strategy itself in-stream (see `src/routes/api/onboarding/chat.ts`). Strategy
> **persistence** (the `project_context_versions` store + R2 versioning) and the
> `get_project_context` **MCP tool** are deferred to a later PR. Onboarding
> spend — DataForSEO **and** LLM tokens — draws down the org's onboarding-plan
> trial credits via the normal balance gate. The sections below describe the
> original plan, not what shipped.

## TL;DR

Onboarding has two simple pieces, no agent framework:

1. **A seed function** (plain async): discover sitemap → scrape 3–5 pages to
   markdown (Browser Rendering) → 2 paid DataForSEO calls → one OpenRouter
   synthesis call → save the result as the project's first **Project Context**
   version. Runs once when onboarding kicks off.
2. **A normal streaming chat** (Vercel AI SDK `streamText` over OpenRouter):
   the user asks questions / refines; an `update_project_context` tool writes a
   new version. Backed by a plain API route on the existing better-auth session.

The Project Context is **versioned**: immutable markdown blobs in R2, an
append-only log in D1. Reverts reuse a prior blob's key. It's exposed over MCP
via `get_project_context`.

## Why not Think / Workflows (and why `agents` stays)

- **No durable execution needed.** The paid DataForSEO services are _cache-first_
  (`getCached` runs before `createDataforseoClient`/metering), so a crash-and-retry
  of the same domain re-hits the 12h R2 cache → no double-spend. That removed the
  only reason for fibers/Workflows.
- **No agent host needed.** The capabilities we want (stream answers, a future
  docs tool, save/update the artifact) are all plain `streamText({ tools })`.
  Think's distinctive value (durable DO sessions, scheduled turns, sub-agents)
  isn't used by any of them.
- **The `agents` package stays** — it's used by the MCP handler
  (`agents/mcp` → `createMcpHandler` in `src/server/mcp/transport.ts`), not as an
  agent runtime. No version bump.
- **Graduate later** only when a capability genuinely needs durable sessions,
  `schedule` (weekly rank tracking), or sub-agents (per-competitor). The seed
  function and chat route port straight over.

## Data model

**`projects`** — add `location_code` (int, default 2840), `language_code` (text,
default `'en'`), `onboarding_run_status` (text nullable:
`running|complete|failed`), `onboarding_run_at` (text nullable).

**`project_context_versions`** (new, append-only log):
`id` pk · `project_id` FK · `r2_key` · `author` (`onboarding|chat|user`) ·
`note` nullable · `reverted_from_id` nullable · `created_at`. Current version =
latest row per project. Index on `(project_id, created_at)`.

**R2** — immutable markdown blob per version at
`project-context/{projectId}/{versionId}.md`. **Write R2 first, then the D1
row** (a failure leaves a harmless orphan blob, never a row pointing at nothing).
A revert inserts a new row reusing the target's `r2_key` (no new blob).

## The seed function

`runOnboardingSeed({ projectId, organizationId, userId, userEmail, domain })`:

1. **Admission marker** — atomic `UPDATE projects SET onboarding_run_status =
'running' WHERE id = ? AND onboarding_run_status IS NULL`; proceed only if
   one row changed (else a run is already in flight). This is the at-most-once
   guard.
2. **Discover** — `fetch()` robots.txt + sitemap.xml; shallow fallback.
3. **Read** — scrape 3–5 key pages to markdown via the `BROWSER` binding,
   sequentially. Failure → flag it, never throw the whole run.
4. **Signal** — `DomainService.getOverview` (always) + keyword research seeded
   from scraped themes, both with `creditFeature: 'onboarding'`;
   `getSuggestedKeywords` only if the overview shows real rankings.
5. **Synthesize** — one OpenRouter `generateText`/`streamText` over
   {profile + markdown + signal} → strategy markdown.
6. **Persist** — write version `v1` (author `onboarding`); set
   `onboarding_run_status = 'complete'`. On any throw → `'failed'` (re-runnable;
   retry is cache-backed and cheap).

**Metering** is unchanged: paid calls go through the existing
`createDataforseoClient` seam. A new `'onboarding'` `CreditFeature` tags spend.
A `skipBalanceAssert` flag on the metering path lets a zero-balance new signup
run Stage "Signal" without dead-ending on `INSUFFICIENT_CREDITS`, while still
calling `trackDataforseoCost` (spend metered, not balance-gated). Self-host
already skips Autumn entirely.

## The chat

`POST /api/onboarding/chat` (TanStack `createFileRoute` server handler):

- Auth: resolve the better-auth session from the request; assert the user owns
  `projectId` (org scoping via `ProjectRepository.getProjectForOrganization`).
  No new transport, so no extra auth surface.
- `streamText({ model: openrouter(MODEL), system: seededWithContext, messages,
tools: { update_project_context } })`, returned as a UI message stream.
- `update_project_context({ markdown, note })` writes a new version (author
  `chat`). For v1 it applies directly; the append-only log makes any unwanted
  change one revert away.

Client: AI SDK `useChat({ api: '/api/onboarding/chat' })`. The strategy renders
above the chat; the upgrade CTA is a UI state shown once `v1` exists.

## Auth + email-verify

- Surface `emailVerified` on `EnsuredUserContext` (from
  `session.user.emailVerified`); self-host = treated verified.
- The seed asserts `emailVerified` before the paid "Signal" stage. Discover +
  Read (free) may run unverified.

## MCP

`get_project_context(projectId)` — read-only tool (`readOnlyHint: true`) using
`withMcpProjectAuth`; resolves the latest version → R2 get → returns markdown.
`list_project_context_versions` is a fast-follow.

## Local testing

Real providers, no fixture system:

- Add `OPENROUTER_API_KEY` to `.env.local` (the one new key), `wrangler login`
  for the `BROWSER` binding (`remote: true` in dev).
- DataForSEO creds you already have; the cache makes repeat runs free.
- Drive the real onboarding UI with the Playwriter skill, screenshotting each
  step. **Test domain: `openseo.so`.**

## Build order (stacked PRs)

1. **Foundation** — schema + migration (`projects` cols, `project_context_versions`);
   `emailVerified` on context; `'onboarding'` CreditFeature + label +
   `skipBalanceAssert` flag; country→`location_code` map. No behavior.
2. **Stage 0 form** — domain + country on one step → `projects`.
3. **Project Context store** — R2 blob helper + versions repository +
   `get_project_context` MCP tool.
4. **Scrape + seed + synthesis** — `BROWSER` binding, scrape-to-markdown, the
   seed function, OpenRouter dep, the "generating → strategy" UI.
5. **Chat** — `/api/onboarding/chat` + `update_project_context` tool +
   `useChat` UI + revert.

(There is no fixture-provider PR — we test against real providers.)

## Out of scope (v1)

Think/DO/Workflows, sub-agents, scheduled rank tracking, GSC-enriched strategy,
multi-language, auto content generation, the MCP context _resource_ (tool only).
