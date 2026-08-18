# In-App AI Agent (SAM)

SAM is OpenSEO's in-app SEO agent. It runs inside a Cloudflare Durable Object
via `@cloudflare/think` and calls the same shared MCP tool handlers as the MCP
server — in-process, never over HTTP, and never directly against DataForSEO.

This document describes the configuration surface added in Phase O: model and
provider settings, connection testing, bounded loops, tool-call deduplication,
and workflow presets.

## How Model Configuration Resolves

The agent resolves which model to run on every turn, in this order:

1. **Project settings** (project settings page → AI agent section) — applies
   only when the project has a non-inheriting row saved.
2. **Organization settings** (Settings page → AI agent section) — the global
   default for all projects.
3. `AI_AGENT_MODEL` environment variable.
4. `OPENROUTER_MODEL` environment variable.
5. Built-in default: `minimax/minimax-m3`.

A settings row only counts when **both** provider and model are set. Clearing
a project's model override removes the row entirely, so the project inherits
the organization/environment default again.

Only the provider and model are persisted (table `ai_agent_settings` in both
SQLite and Postgres, one row per scope enforced by partial unique indexes).
Credentials are never stored — the `OPENROUTER_API_KEY` remains a server-side
deployment secret. The UI shows a masked key status (`sk-••••abcd`) and a
"Test connection" button that fires a minimal generation using the
server-managed key; the test is billed to the deployment's OpenRouter account,
not to OpenSEO usage credits.

## Provider Support

OpenRouter is the only provider in this phase (`providers.ts` exposes the
`AiProvider` interface so another provider can slot in without touching the
agent or the UI). The provider supports:

- **Model catalog** — fetched from `https://openrouter.ai/api/v1/models`
  (public, no auth needed), normalized to id/name/context length/pricing/tool
  support, and cached server-side in R2 for 12 hours.
- **Connection test** — a minimal `generateText` with `maxOutputTokens: 8`.
  Failures are classified: `401/403` → invalid key, `404` → model
  unavailable, anything else → provider unreachable.

## Bounded Loops and Cost Control

- `AI_AGENT_MAX_STEPS` (default `48`) — Think's `maxSteps` bound for a turn.
- `AI_AGENT_MAX_TOOL_CALLS` (default `24`) — a stop condition
  (`samTurnControls.ts`) that ends the turn once the cumulative number of tool
  calls across all steps reaches the cap. This is the primary cost guard:
  SEO tool calls are the paid part of a turn.
- **Tool-call dedup** (`samToolExecution.ts`) — each SAM conversation keeps a
  bounded cache (64 entries, oldest evicted) keyed by `toolName:JSON(args)`.
  An identical repeat within the same session is served from cache instead of
  hitting the router again. Errors are never cached. The cache lives on the
  Durable Object instance, so it survives across turns of one conversation but
  is lost on eviction — by design.
- **Tool event logging** — every tool execution emits a structured
  `sam-tool` JSON log line (tool, reused flag, status, duration).

The system prompt also instructs SAM to reuse already-fetched data rather than
re-requesting tools, and to treat tool outputs as untrusted data
(prompt-injection guidance).

## Tool Surface

SAM exposes the shared MCP toolset (~23 tools), including four site-audit
tools added in Phase O: `run_site_audit`, `get_audit_status`,
`get_audit_issues`, and `get_audit_pages`. All tools keep their existing
authorization, DataRouter, cache, and budget behavior — SAM adds no new
mutation-capable tools.

## Workflow Presets

The SAM empty state offers five one-click workflow templates in addition to
the quick-question chips:

1. **Full SEO opportunity analysis** — site read + Search Console + keyword
   gaps, prioritized.
2. **Commercial keyword research** — high-intent terms with volume/difficulty
   and page placement suggestions.
3. **Competitor analysis** — SERP competitors, their coverage, and your gap
   list.
4. **Technical SEO** — site audit followed by a prioritized fix order.
5. **Executive SEO plan** — current standing, top moves, expected impact, and
   a 90-day timeline.

## Configuration Files

| Concern | Location |
|---------|----------|
| Settings table + migrations | `src/db/sam.schema.ts`, `src/db/pg/sam.schema.ts`, `drizzle/0039_ordinary_azazel.sql`, `drizzle-pg/0016_sloppy_cargill.sql` + `0017_mute_joshua_kane.sql` |
| Repository (org/project rows) | `src/server/features/ai/AiSettingsRepository.ts` |
| Provider abstraction + OpenRouter | `src/server/features/ai/providers.ts` |
| Resolution + masked status | `src/server/features/ai/AiSettingsService.ts` |
| Server functions (settings/models/test) | `src/serverFunctions/aiSettings.ts` |
| Agent wiring (model, bounds, tracker) | `src/server/features/sam/SamChatAgent.ts` |
| Tool adapter (dedup + audit tools) | `src/server/features/sam/samChatTools.ts` |
| Loop bounds | `src/server/features/sam/samTurnControls.ts` |
| Tool execution tracking | `src/server/features/sam/samToolExecution.ts` |
| Settings UI (global) | `src/client/features/ai/AiSettingsSection.tsx` |
| Settings UI (project override) | `src/client/features/ai/ProjectAiSettingsSection.tsx` |
| Presets | `src/client/features/sam/SamConversation.tsx` |

## Environment Variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | *(none)* | Server-side credential; required to run SAM |
| `OPENROUTER_MODEL` | `minimax/minimax-m3` | Env fallback model |
| `AI_AGENT_MODEL` | *(none)* | Preferred env fallback model |
| `AI_AGENT_MAX_STEPS` | `48` | Turn step bound |
| `AI_AGENT_MAX_TOOL_CALLS` | `24` | Tool-call cap per turn |

## Testing

New focused tests cover provider catalog parsing/failure classification
(`providers.test.ts`), settings resolution order and key masking
(`AiSettingsService.test.ts`), dedup cache and event logging
(`samToolExecution.test.ts`), and env parsing plus the tool-call counter
(`samTurnControls.test.ts`). Tests mock the provider (`fetch`, `generateText`)
and the R2 cache; no real provider or database calls are made.