# Project memory (shared AI context per project)

## Status

Accepted

## Context

Qualitative knowledge about a project — what the business does, the current
goal, positioning, writing preferences, competitors, which pages matter — is
scattered across surfaces that cannot see each other:

- **SAM** keeps it in `sam_project_memory`, two free-form markdown blobs
  (`memory`, `research_log`) per project, writable only by the model via
  Think's `set_context`. There is no UI; users cannot see or correct what SAM
  believes.
- **Skills** (Claude Code / Codex users) keep it in a local folder the
  `seo-project-setup` skill scaffolds — a `README.md` with goals, sites, and
  preferences that never reaches the server, so SAM and the app never benefit.
- **Competitors are never persisted anywhere.** `find_serp_competitors`
  results are returned and discarded.
- The onboarding chat agent produces a positioning/themes/keywords strategy
  and persists none of it.

The result: every surface re-interviews the user or re-infers the same facts,
paid research gets repeated because no surface knows another already ran it,
and there is no place a user can inspect or edit what the AI knows about their
project.

## Decision

One project-scoped memory store, shared by SAM, the MCP server, and a new
settings UI. Hybrid shape: a fixed set of typed sections with real schemas,
plus agent-creatable custom sections for anything that doesn't fit yet. It
replaces `sam_project_memory` entirely.

### Data model

List-shaped entities are normalized tables; prose lives in a sections table.
All tables follow the D1 + Postgres dual-schema convention (`src/db/*.schema.ts`
mirrored in `src/db/pg/*.schema.ts`, schema-parity test, `pnpm db:generate`
for both dialects).

```
project_context_sections
  project_id   FK → projects (cascade)
  key          text        -- typed key or "custom:<slug>"
  title        text?       -- custom sections only
  content      text        -- markdown
  updated_at   text
  updated_by   text        -- "user" | "sam" | "mcp"
  PK (project_id, key)

project_competitors
  id, project_id FK (cascade)
  domain       text        -- normalized host, unique per project
  name         text?
  notes        text?       -- "direct competitor, strong on comparison pages"
  updated_at, updated_by
  UNIQUE (project_id, domain)

project_key_pages
  id, project_id FK (cascade)
  url          text        -- unique per project
  role         text        -- "hub" | "spoke" | "money" | "other"
  topic        text?       -- target topic/keyword
  notes        text?
  updated_at, updated_by
  UNIQUE (project_id, url)

project_research_log
  id, project_id FK (cascade)
  entry_date   text        -- YYYY-MM-DD, server-stamped
  summary      text        -- "<what>: <inputs>. Verdict: <conclusion>"
  created_by   text        -- "user" | "sam" | "mcp"
```

Typed section keys: `business_overview` (what the business does, who it's
for, target market/locales), `current_goal`, `positioning`,
`writing_preferences` (voice, banned words/phrases, topics to avoid).

Guardrails: prose sections capped at ~4,000 chars; custom sections capped at
20 per project and ~4,000 chars each; competitors and key pages capped at 100
rows each; research log pruned to 90 days on append. Caps keep the full
context small enough to inject into every SAM turn and return cheaply from
MCP.

**Deliberately not stored:** a sitemap or crawl copy. The page inventory
lives in `audit_pages` (latest audit) and GSC, reachable through existing
tools. `project_key_pages` is a curated shortlist, not an inventory; agents
may propose entries from audit/GSC data.

### MCP tools (two, free, no credits)

- **`get_project_context(projectId)`** — read-only. Returns everything:
  typed sections, competitors, key pages, custom sections, recent research
  log. `text` is a rendered markdown digest; `structuredContent` carries the
  typed data. Empty sections are listed explicitly ("missing: positioning,
  writing_preferences") so agents know what to fill and can suggest
  `seo-project-setup`.
- **`update_project_context(projectId, updates[])`** — an array of patch
  ops, discriminated union:
  - `{ section, content }` — set a typed section (empty string clears)
  - `{ customSection, title?, content }` / `{ deleteCustomSection }`
  - `{ addCompetitors: [{domain, name?, notes?}] }` (upsert by domain),
    `{ removeCompetitors: [domain] }`
  - `{ addKeyPages: [{url, role, topic?, notes?}] }` (upsert by url),
    `{ removeKeyPages: [url] }`
  - `{ appendResearchLog: { summary } }` — server stamps the date;
    `{ removeResearchLog: [id] }`

Both use `withMcpProjectAuth`, standard layering (tool → `ProjectContextService`
→ repository), `readOnlyHint` annotations, deep-link `meta` to the Context
settings page. Writes record `updated_by: "mcp"`. Register in
`src/server/mcp/server.ts` and the hand-maintained catalogue in
`src/client/features/ai-mcp/AvailableTools.tsx`.

### SAM integration

`sam_project_memory` is removed; the `SamChatAgent` block provider seam is
where the swap happens:

- The writable `memory`/`research_log` blocks are replaced by a single
  **read-only** context block rendering `get_project_context` output
  (refreshed after each turn, as today, so cross-session writes land).
- SAM writes through the same adapted `update_project_context` tool that
  MCP clients use (via `adaptMcpTool`, projectId injected), recorded as
  `updated_by: "sam"`. One write path, one validation surface.
- The system prompt keeps its contract but points at the typed sections:
  intake mode triggers when `business_overview` is empty; the bootstrap flow
  (read site, infer, confirm, write) now writes typed sections and
  competitors instead of a prose blob; the 30-day research-staleness rule
  reads `project_research_log`.

**Migration:** none. SAM usage is low, so `sam_project_memory` is dropped
outright (schema removal + drop migration); existing SAM memories are
discarded and SAM re-runs its intake flow on next use.

### UI

Project settings gets a gear button on the project switcher (replacing its
absence from any navigation) and splits into sub-pages:

- **General** — existing name/domain/market form
- **Context** (new) — the memory UI: editable forms for the four prose
  sections, tables with inline add/edit/delete for competitors and key pages,
  cards for custom sections (rename/edit/delete), research log list
  (read-only + delete). Every item shows provenance: "Updated by SAM · 2d
  ago". Edits record `updated_by: "user"`.
- **Integrations** — Search Console + Analytics cards move here

The gear lives on the switcher, so settings is reachable from every view
(including SAM's chat tab); existing deep links
(`#google-analytics`, GSC connect) keep working via redirects to the
Integrations sub-page. Server functions follow the standard
`requireProjectContext` → service → repository path with Zod schemas in
`src/types/schemas/`.

### Skills

Skills reach the store only through the two MCP tools (skills are distributed
by file copy; there is no server-side delivery).

- **`seo-project-setup` rewritten** to be the canonical populate flow: the
  interview steps (site scope, goals, positioning, competitors, key assets)
  now end in `update_project_context` writes instead of a local `README.md`.
  Local-folder scaffolding remains only for file-based work (GSC CSV
  fallback, drafts).
- **Every SEO skill gets a standard "Project context" preamble**:
  1. Call `get_project_context` first; use it to ground the work.
  2. If the sections this skill _requires_ are empty, run a minimal inline
     setup — ask (or infer from the site and confirm) just enough to fill
     them, write them back, then continue the actual task. Suggest the full
     `seo-project-setup` at the end. Never front-load the full interview.
  3. Before paid research, check the research log (30-day staleness rule).
  4. On finish, write back: durable learnings → sections/entities, research
     spend → `appendResearchLog`.

  Required sections per skill: keyword-research → business_overview +
  current_goal; competitive-landscape / competitor-analysis → competitors;
  keyword-clustering → key pages; link-prospecting → positioning +
  competitors; seo-audit → business_overview; seo-coach → reads everything,
  requires nothing. Content-drafting flows additionally require
  writing_preferences.

Hand-maintained lists to update when skills change: `src/routes/_app/ai.tsx`
(`SKILL_NAMES` etc.) and `web/content/docs/skills/*`.

### Rollout

1. **Schema + service + MCP tools** (with the `sam_project_memory` drop) —
   the store exists, Claude Code users can use it end-to-end.
2. **SAM cutover** — block provider swap, prompt update, tool adaptation.
3. **UI** — switcher gear, settings sub-pages, Context page.
4. **Skills pass** — rewrite `seo-project-setup`, add the preamble to the
   SEO skills, update docs pages.

In practice all four phases landed together on one branch.

## Consequences

- One source of truth: SAM, MCP clients, and the UI read and write the same
  records; users can finally inspect and correct agent beliefs, with
  provenance on every item.
- Cross-surface research dedupe: the shared log stops SAM and Claude Code
  from independently re-buying the same research.
- Competitors and key pages become joinable product data — future
  rank-tracker comparisons, share-of-voice, and audit cross-references can
  reference them without parsing prose.
- Typed sections require a code change to extend; the custom-section
  overflow is the pressure valve and tells us which section to promote next.
- Two more MCP tool schemas in every client's token budget (mitigated by
  keeping the patch union compact).
- The onboarding chat agent still discards its strategy output; persisting it
  into these sections is a natural follow-up, out of scope here.
