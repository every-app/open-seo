# In-App AI Agent Audit

## Scope

This audit covers the repository state before Phase O changes. The repository
already contains an in-app SEO agent named SAM, so Phase O should extend that
implementation rather than introduce a second chat or agent stack.

## Existing AI Architecture

- `src/server/features/sam/SamChatAgent.ts` implements the SAM Durable Object
  using `@cloudflare/think`. Think owns the agent loop, message persistence,
  streaming protocol, and turn lifecycle.
- `src/server/lib/openrouter.ts` builds the OpenRouter AI SDK model using the
  server-only `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` environment values.
- `src/server/features/sam/samChatTools.ts` adapts the existing MCP tool
  definitions directly into AI SDK tools. It calls MCP handlers in-process and
  does not make an HTTP request to `/mcp`.
- `src/server/features/sam/samSystemPrompt.ts` supplies the project-aware SAM
  prompt, market context, cost warnings, and project-memory instructions.
- `src/client/features/sam/SamConversation.tsx` and related components provide
  the chat UI, streaming messages, tool badges, retry/error state, undo/edit,
  and suggestion prompts.
- `src/db/sam.schema.ts` and `src/db/pg/sam.schema.ts` persist session registry
  rows and shared project memory. The Durable Object stores the transcript.
- `src/serverFunctions/sam.ts` authorizes session creation/listing through the
  authenticated project context. The Worker authorizes Durable Object
  connections before they reach SAM.
- Hosted billing gates and meters SAM turns in `SamChatAgent.ts`; SEO tool
  handlers retain their existing authorization, DataRouter, provider, cache,
  and budget behavior.

## Reusable Components

- OpenRouter AI SDK provider: `src/server/lib/openrouter.ts`.
- Shared MCP tool definitions and handlers: `src/server/mcp/tools/**`.
- MCP authorization context: `src/server/mcp/context.ts` and project auth
  helpers.
- Existing chat rendering: `src/client/components/chat/ChatMessage.tsx`.
- Existing project-scoped server-function middleware:
  `src/serverFunctions/middleware.ts`.
- Existing Docker/Wrangler runtime and Durable Object bindings.

## Existing Tool Surface

SAM already exposes shared tools for domain overview, keyword research and
metrics, ranked keywords, SERPs, competitors, backlinks, Search Console,
local research, rank tracking, saved keywords, product information, and free
site reading. The MCP server additionally contains the site-audit tools:
`run_site_audit`, `get_audit_status`, `get_audit_issues`, and
`get_audit_pages`; these are not currently included in SAM's tool set.

## Existing Limitations

- OpenRouter is the only provider and credentials are environment-managed.
- There is no AI provider/model settings section in the application.
- `OPENROUTER_MODEL` is the only model override; there is no global/project
  persisted model resolution.
- OpenRouter model discovery and connection testing are not implemented.
- SAM has a hard-coded Think step limit but no configurable tool-call limit or
  conversation-level duplicate-call cache.
- Workflow presets are limited to static suggestion chips.
- SAM's existing tool surface includes legacy mutation-capable tools such as
  `save_keywords`; Phase O should not add new mutations and should document or
  constrain any new read-only surface carefully.
- Tool-level structured observability is primarily provided by the existing MCP
  instrumentation; SAM-specific tool timing and deduplication telemetry are not
  yet present.

## Proposed Integration Points

1. Extend the existing OpenRouter module with a small provider boundary for
   model listing, connection testing, and model construction. Keep OpenRouter
   as the only implementation in this phase.
2. Add server-side AI settings resolution with project override, organization
   default, and environment fallback. Persist provider/model only; retain API
   credentials in the existing server-side secret/environment mechanism unless
   a reviewed secure secret store already exists.
3. Add model discovery and connection-test server functions backed by a short
   server-side metadata cache.
4. Add the missing site-audit tools to SAM by adapting the existing MCP
   definitions, not by duplicating audit services.
5. Add configurable bounded-loop controls and per-conversation duplicate-call
   reuse around the existing SAM tool adapter.
6. Extend the existing Settings page and SAM suggestion UI with model selection,
   connection status, project override controls, and workflow presets.
7. Add focused mocks for provider, settings resolution, tool deduplication,
   authorization, failure handling, and the shared-tool contract.

## Files Expected To Change

- `src/server/lib/openrouter.ts`
- `src/server/features/sam/SamChatAgent.ts`
- `src/server/features/sam/samChatTools.ts`
- `src/server/features/sam/samSystemPrompt.ts`
- `src/client/features/sam/SamConversation.tsx`
- `src/routes/_app/settings.tsx`
- New AI provider/settings server modules and focused tests
- D1/Postgres schema and migration files if persisted model settings are added
- `.env*.example`, Docker documentation, and Phase O documentation

## Files That Should Remain Untouched

- Existing DataRouter, provider, cache, and DataForSEO implementation details
  unless a shared public seam is strictly required.
- Existing MCP tool behavior and validation, except for importing/adapting the
  already-implemented site-audit definitions.
- Existing Free-First cache/budget accounting behavior.
- Historical migration files and unrelated generated route artifacts unless the
  repository's normal migration or route generation workflow requires a new
  generated artifact.

## Security and Scope Decision

The repository has server-side environment/secret handling but no reviewed
per-user encrypted secret store. Phase O therefore must not add a plaintext
API-key column. The UI can select provider/model and test the server-managed
credential; documentation must state that `OPENROUTER_API_KEY` remains a
server-side deployment secret. The agent remains project-authorized and must
continue to call shared handlers directly, never DataForSEO or MCP over HTTP.

## Post-O2 Status

The sections above record the pre-Phase-O baseline. Phase O2 (multi-provider
AI) resolved the limitations as follows:

- **Multi-provider**: `providers.ts` + `provider-adapters.ts` +
  `provider-shared.ts` now expose four providers (OpenRouter, OpenAI, Google
  Gemini, Anthropic) behind the `AiProvider` interface. Credentials stay
  server-side deployment secrets (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
  `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`); the UI shows masked status and
  per-provider connection tests, never a plaintext key.
- **Persisted resolution**: `ai_agent_settings` rows (project/org scope) now
  persist `{provider, model}`; `resolveAiSettings` applies project row →
  org row → `AI_AGENT_PROVIDER`/`AI_AGENT_MODEL` env → per-provider env model
  → built-in default. Invalid provider/model pairs are rejected at save and
  normalized at runtime (never sent to the wrong API).
- **Model discovery + connection testing**: per-provider catalog fetches
  cached 12h in R2; connection tests classify invalid key / model unavailable /
  provider unreachable, and short-circuit when the key is missing.
- **Bounded loops + dedup**: configurable `AI_AGENT_MAX_TOOL_CALLS` stop
  condition and per-conversation dedup cache (see `in-app-ai-agent.md`).
- **Settings UI**: global + project sections with provider selector,
  per-provider model picker (catalog filter + manual entry fallback), masked
  key readouts, capabilities row, and connection test; the project section has
  an inherit toggle. Provider switch resets the model; dirty tracking gates
  saving.
- **No plaintext keys**: the "no plaintext API-key column" decision held.
- **Unchanged**: SAM remains provider-agnostic (no provider-specific logic in
  the SAM layer), MCP tool behavior, DataRouter/cache/budget behavior, and the
  shared-tool contract are untouched.

## Post-P Status (long-running tool execution)

Phase P hardened how the agent handles asynchronous workflows (site audits)
without changing any SEO service, the DataRouter, or the DataForSEO
architecture:

- **Robustness**: a stale-cache defect was fixed — `get_audit_status` reads
  were being served from the conversation dedup cache, so repeated polls
  returned the same "running" snapshot until the Durable Object was evicted.
  Progress reads over mutable state are now always fresh. The agent waits for
  terminal audit states through one bounded orchestrator (`poll_site_audit`)
  instead of unbounded improvised polling; attempt and wall-clock budgets are
  env-tunable and cannot loop forever. A user asking only to start an audit is
  no longer blocked waiting; an audit that fails, is cancelled/deleted, or
  times out produces an honest explanation — never fabricated results.
- **Security posture unchanged**: polling reads go through the same
  project-scoped MCP handler (identical authorization and self-heal), tool
  execution stays read-only, and no new mutation-capable surface was added.
  Observability improved: every internal status read plus a per-wait summary
  line is logged under the existing `sam-tool` events.
