# In-App AI Agent (SAM)

SAM is OpenSEO's in-app SEO agent. It runs inside a Cloudflare Durable Object
via `@cloudflare/think` and calls the same shared MCP tool handlers as the MCP
server — in-process, never over HTTP, and never directly against DataForSEO.

This document describes the configuration surface added in Phases O and O2:
multi-provider model and provider settings, connection testing, bounded loops,
tool-call deduplication, and workflow presets.

## How Model Configuration Resolves

The agent resolves which provider and model to run on every turn, in this
order:

1. **Project settings** (project settings page → AI agent section) — applies
   only when the project has a non-inheriting row saved.
2. **Organization settings** (Settings page → AI agent section) — the global
   default for all projects.
3. `AI_AGENT_PROVIDER` + `AI_AGENT_MODEL` environment variables (provider must
   be one of `openrouter | openai | gemini | anthropic`; anything else is
   ignored).
4. The chosen provider's own fallback model env var (`OPENROUTER_MODEL`,
   `OPENAI_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`).
5. Built-in defaults per provider (`openrouter` → `minimax/minimax-m3`,
   `openai` → `gpt-5`, `gemini` → `gemini-2.5-flash`, `anthropic` →
   `claude-sonnet-4-5`).

When no settings row and no `AI_AGENT_PROVIDER` exist, the default provider is
**openrouter**, which preserves the pre-O2 single-provider behavior.

A settings row only counts when **both** provider and model are set. Model ids
are validated against the selected provider's pattern (see
`validateModelForProvider` in `providers.ts`); an invalid pair is rejected at
save time, and a settings row whose model doesn't match its provider (for
example from an older save) is normalized at runtime to the provider's default
model instead of being sent to the wrong API. Clearing a project's model
override removes the row entirely, so the project inherits the
organization/environment default again.

Only the provider and model are persisted (table `ai_agent_settings` in both
SQLite and Postgres, one row per scope enforced by partial unique indexes).
Credentials are never stored — `OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, and `ANTHROPIC_API_KEY` remain server-side deployment
secrets. The UI shows masked key status per provider (`sk-••••abcd` or
"Not configured") and a "Test connection" button per provider that fires a
minimal generation using the server-managed key; the test is billed to the
deployment's own provider account, not to OpenSEO usage credits.

## Provider Support

Four providers are supported (adapters in `provider-adapters.ts`, shared
helpers in `provider-shared.ts`, contract + registry in `providers.ts`; the
`AiProvider` interface lets another provider slot in without touching the
agent or the UI):

| Provider | Key env var | Model env var | Built-in model |
|----------|-------------|---------------|----------------|
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `minimax/minimax-m3` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-5` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-2.5-flash` |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-4-5` |

Every provider supports:

- **Model catalog** — fetched from the provider's public models endpoint
  (OpenRouter: `/api/v1/models` without auth; OpenAI: `/v1/models`; Gemini:
  `/v1beta/models`; Anthropic: `/v1/models`), normalized to
  id/name/context length/pricing/tool support, and cached server-side in R2
  for 12 hours. An unconfigured or unreachable provider yields an empty
  catalog; the UI then degrades to a manual model-id input.
- **Connection test** — a minimal `generateText` with `maxOutputTokens: 8`
  plus a best-effort tool-calling probe. Failures are classified:
  `401/403` → invalid key, `404` → model unavailable, anything else →
  provider unreachable. Missing keys short-circuit without calling the API.
- **Cost estimate** — real per-call USD cost when the provider reports it
  (OpenRouter via `providerMetadata.openrouter.usage.cost`); providers without
  per-call pricing report 0.

The SAM agent itself stays provider-agnostic: it receives a resolved
`{provider, model}` pair and a matching `LanguageModelV3` instance; there is no
provider-specific logic in the SAM tool layer. AI SDK version pairing note:
the app pins `ai@6.x` (required by `@cloudflare/think`'s peer range
`^6.0.182`) with `@ai-sdk/openai@3.x`, `@ai-sdk/google@3.x`, and
`@ai-sdk/anthropic@3.x`, whose chat models are `LanguageModelV3` — compatible
with ai 6's `LanguageModel` union.

## Long-Running Tools (Site Audits)

Site audits are asynchronous workflows: `run_site_audit` starts one and
returns immediately with `{auditId, state: "started"}`; results don't exist
yet at that point. The agent distinguishes a **START request** ("start an
audit" — starting it is a complete answer) from a **FINAL RESULT request**
("give me the page count / issues") and, for the latter, waits for a terminal
state through the dedicated `poll_site_audit` tool before answering.

`poll_site_audit` is agent-side orchestration around the same
`get_audit_status` handler the MCP server registers (identical D1 state,
project scoping, and dead-workflow self-heal — no state bypass):

- **Normalized states** — every read maps to
  `started | running | completed | failed | cancelled` with
  `progress: {current, total}` and `resultReady`. There is no distinct
  persisted "cancelled" state: an audit deleted mid-wait surfaces as
  NOT_FOUND → `cancelled`; a terminated workflow self-heals to `failed`.
- **Polling policy** — exponential backoff (first read immediate, then ~1s,
  ~2s, ~4s… capped), bounded by both an attempt cap and an overall
  wall-clock window.
- **Terminal behavior** — `completed` → fetch `get_audit_issues` /
  `get_audit_pages` only as the request requires; `failed`/`cancelled` →
  plain explanation, offer to retry; budget exhausted while still running →
  the agent says exactly that the audit is still running and never invents
  page counts or issues from partial progress.
- **Budget accounting** — the wait counts as ONE call toward
  `AI_AGENT_MAX_TOOL_CALLS`; its internal status reads are logged (full
  observability preserved) but are cheap OpenSEO-state reads, not paid calls,
  and cannot loop forever.
- **Single-flight** — concurrent waits in the same conversation share one
  poller per audit; terminal results are memoized per explicit audit id.
- **UX aggregation** — repeated polling collapses into one chat badge
  ("Running site audit…"), with the outcome/progress as a suffix ("complete ·
  50/50 pages"). The dedup cache never serves stale audit-status snapshots.

Polling bounds are env-tunable (defaults in `samTurnControls.ts`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `AI_AGENT_POLL_INITIAL_MS` | `1000` | First backoff delay |
| `AI_AGENT_POLL_MAX_MS` | `8000` | Backoff cap between reads |
| `AI_AGENT_MAX_POLL_ATTEMPTS` | `12` | Max status reads per wait |
| `AI_AGENT_TOOL_TIMEOUT_MS` | `150000` | Overall wall-clock window per wait |

The orchestration is provider-neutral: it is plain tool logic around OpenSEO
state, with no model- or provider-specific branching.

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
| Provider contract + registry + validation | `src/server/features/ai/providers.ts` |
| Provider adapters (OpenAI/Gemini/Anthropic/OpenRouter) | `src/server/features/ai/provider-adapters.ts` |
| Shared probe/cache/classification helpers | `src/server/features/ai/provider-shared.ts` |
| Resolution + masked status | `src/server/features/ai/AiSettingsService.ts` |
| Server functions (settings/models/test) | `src/serverFunctions/aiSettings.ts` |
| Agent wiring (model, bounds, tracker) | `src/server/features/sam/SamChatAgent.ts` |
| Tool adapter (dedup + audit tools) | `src/server/features/sam/samChatTools.ts` |
| Loop bounds | `src/server/features/sam/samTurnControls.ts` |
| Long-running tool orchestration (audit polling) | `src/server/features/sam/samLongRunningTools.ts` |
| Tool execution tracking | `src/server/features/sam/samToolExecution.ts` |
| Settings UI (global) | `src/client/features/ai/AiSettingsSection.tsx` |
| Settings UI (project override) | `src/client/features/ai/ProjectAiSettingsSection.tsx` |
| Model picker + catalog filter | `src/client/features/ai/AiModelSelect.tsx`, `src/client/features/ai/modelFilter.ts` |
| Connection test UI | `src/client/features/ai/AiConnectionTest.tsx` |
| Presets | `src/client/features/sam/SamConversation.tsx` |

## Environment Variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `AI_AGENT_PROVIDER` | `openrouter` | Default provider when no settings row exists (`openrouter`/`openai`/`gemini`/`anthropic`) |
| `OPENROUTER_API_KEY` | *(none)* | OpenRouter credential; enables the provider |
| `OPENAI_API_KEY` | *(none)* | OpenAI credential; enables the provider |
| `GEMINI_API_KEY` | *(none)* | Google Gemini credential; enables the provider |
| `ANTHROPIC_API_KEY` | *(none)* | Anthropic credential; enables the provider |
| `AI_AGENT_MODEL` | *(none)* | Preferred env fallback model (for `AI_AGENT_PROVIDER`) |
| `OPENROUTER_MODEL` | `minimax/minimax-m3` | OpenRouter env fallback model |
| `OPENAI_MODEL` | `gpt-5` | OpenAI env fallback model |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini env fallback model |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Anthropic env fallback model |
| `AI_AGENT_MAX_STEPS` | `48` | Turn step bound |
| `AI_AGENT_MAX_TOOL_CALLS` | `24` | Tool-call cap per turn |

Note for local Docker dev: provider keys must come through `.env.docker` via
`env_file` — an `environment:` mapping in `compose.dev.yaml` would override
the env_file value with the host shell's unset variable and silently disable
the provider.

## Testing

Focused tests cover provider catalog parsing/failure classification and the
registry (`providers.test.ts`), settings resolution order, per-provider
precedence, invalid-pair validation, and key masking
(`AiSettingsService.test.ts`), the model-picker filter (`AiModelSelect.test.ts`),
dedup cache and event logging (`samToolExecution.test.ts`), and env parsing
plus the tool-call counter (`samTurnControls.test.ts`). Tests mock the
provider (`fetch`, `generateText`) and the R2 cache; no real provider or
database calls are made.