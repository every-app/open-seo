# Review guidelines

Context for anyone or any agent reviewing an OpenSEO change: merge-ready,
`/code-review`, and human reviewers. It began life as the
repository's Greptile configuration; Greptile is no longer wired to this
repository, but the invariants and the false-positive controls still describe
how the codebase is meant to work. Keep this file high-signal: a review finding
is evidence to evaluate, not automatically a new rule. One-off bugs get a code
fix and a regression test, deterministic checks belong in CI or lint, and only
recurring or high-risk invariants earn a paragraph here.

## Hard invariants

Each of these has a concrete failure mode in production. A change inside the
listed scope that weakens one is a blocker until it is justified.

### Tenant and resource scoping

Applies to: `src/lib/auth*.ts`, `src/server.ts`, `src/server/features/**`, `src/serverFunctions/**`, `src/server/mcp/**`, `src/routes/api/**`, `src/middleware/**`, `web/src/routes/api/**`.

At each external trust boundary, establish the appropriate authorization before dispatch: session middleware for user endpoints, withMcpProjectAuth for project-scoped MCP handlers, signed state or verified provider signatures for callbacks and webhooks, and an explicit documented decision for public routes. Active project-scoped server functions use requireProjectContext with a validated projectId. Reads and mutations keyed by caller-controlled resource IDs must include the verified project, organization, or user in the query, or first authorize through a canonical parent lookup. Never trust a client-supplied organization, user, or billing identity. Archived or lifecycle resources may use requireAuthenticatedContext plus an explicit organization-scoped lookup. Bare-ID lookups are acceptable in trusted internal Workflow or Durable Object paths only when the upstream authorization invariant is explicit.

### Normalized product data

Applies to: `src/db/**`, `drizzle/**`, `drizzle/pg/**`, `src/server/**/repositories/**`, `src/server/**/*Repository.ts`.

Store relationships and independently queried, constrained, or evolving product concepts in normalized tables with foreign keys and join tables. Do not put relational IDs in JSON or delimited text to avoid joins. JSON or text is acceptable for opaque provider payloads, immutable history, caches, or bounded non-relational value arrays when the reason is clear.

### SQLite and Postgres parity

Applies to: `src/db/**`, `drizzle/**`, `src/lib/auth.ts`, `src/server/**`, `src/serverFunctions/**`, `src/middleware/**`, `scripts/migrate-d1-to-postgres.ts`.

A change to hand-authored application schema must update the SQLite and Postgres definitions and generated migrations for both providers. Preserve equivalent table, column, nullability, default, constraint, index, and foreign-key semantics while allowing intentional dialect-native representations and Better Auth exceptions. Queries, raw SQL, timestamp comparisons, conflict handling, and database-error classification must work on both providers or branch explicitly. Review provider-aware exports, schema-parity coverage, and D1-to-Postgres migration code when affected.

### Postgres client scope at entry points

Applies to: `src/server.ts`, `src/server/**`, `src/serverFunctions/**`, `src/routes/api/**`, `src/middleware/**`.

Every Worker, scheduled handler, Durable Object method or callback, or other entry point that can reach provider-aware Drizzle db from @/db without a guaranteed ambient request scope must establish withPgClient. Durable Object ctx.storage and framework-managed agent message persistence are not @/db access and do not need this wrapper. Every Cloudflare Workflow step uses pgStep; raw step.do is confined to the pgStep helper. Do not assume AsyncLocalStorage scope survives across Workflow steps or Durable Object callbacks.

### Atomic multi-statement writes

Applies to: `src/server/**`, `src/serverFunctions/**`, `src/middleware/**`, `src/db/runBatch.ts`.

When partial completion would violate an invariant, use runBatch and build every statement from its tx callback. executeInBatches is only for work where each committed chunk is independently safe or idempotent; it is not an all-or-nothing transaction. Hard concurrency or capacity admission must use a database constraint, transactional conditional write, or rollback-safe insert-first admission rather than count-then-act. Bound large inArray and bulk-value parameter lists for D1. Retryable Workflow writes need deterministic IDs, stable unique keys, or conflict-safe upserts.

### The billable DataForSEO seam

Applies to: `src/server/lib/dataforseo/**`, `src/server/lib/dataforseoBillingClassification.ts`, `src/server/features/**`, `src/server/mcp/**`, `src/server/workflows/**`, `src/serverFunctions/**`.

Every billable hosted DataForSEO call uses createDataforseoClient with organization billing context. Preserve provider billing path and cost metadata when a billed response later fails parsing or validation so metering still occurs. Do not charge cache hits or provider-unbilled failures. Self-hosted calls, free location data, tests using SDK models, and queued task_get collection are intentional exceptions.

### Billing fails closed

Applies to: `src/shared/billing*.ts`, `src/shared/rank-tracking.ts`, `src/server.ts`, `src/server/billing/**`, `src/server/lib/chatAgent.ts`, `src/server/lib/dataforseoBillingClassification.ts`, `src/server/lib/openrouter.ts`, `src/server/lib/audit/lighthouse.ts`, `src/server/lib/dataforseo/**`, `src/server/features/**`, `src/server/mcp/**`, `src/server/workflows/**`, `src/serverFunctions/**`, `src/routes/api/autumn/**`.

Every billable hosted provider path must check organization credits before paid execution and meter provider-reported spend through the established shared credit-spend helper after execution. A failed gate prevents the paid call. A bounded partial-success API may surface a failed billing check as an explicit item-level error, but it must not present the paid operation as successful. Authorization failures terminate the request. Never use a stale-positive cache that can authorize access or spend that a live check would deny, and ensure retries or Workflow replays cannot omit metering or double-charge.

Build every Autumn billing request (attach, subscription updates, the customer portal, customer creation) on the server from fixed plan IDs and server-chosen parameters; a client may supply only narrow validated values such as a bounded top-up amount or a sanitized return path. Never forward a client-supplied request body to an Autumn call made with the secret key: its parameters include ways to change prices, skip payment, or enable a plan before it is paid, and an owner check does not help because every user owns their own organization.

### Untrusted outbound URLs

Applies to: `src/server/**`, `src/serverFunctions/**`, `src/routes/api/**`.

Before fetching a user-derived initial target, call normalizeAndValidateStartUrl and use manual redirect handling. A redirect followed directly must be revalidated with normalizeAndValidateStartUrl before the next fetch. The audit crawler may record a redirect and enqueue its target instead; every discovered link, sitemap entry, or redirect target admitted to that crawl frontier must pass isCrawlableUrl plus the crawl's same-origin and robots policy before fetch. Never use automatic redirect following for an untrusted URL. Fixed provider URLs are exempt from SSRF screening but still follow their shared client's timeout, retry, and error policy.

### Safe external links

Applies to: `src/client/**`, `src/routes/**/*.tsx`.

A clickable URL from API, crawl, LLM, or provider data must use getSafeExternalUrl, ExternalUrlCell, SafeExternalLink, or the shared Markdown and MARKDOWN_COMPONENTS renderer. Do not render untrusted values through a raw href or a new ad hoc scheme-check regex. Static developer-authored URLs are exempt.

### Behavioral evidence for risky changes

Applies to: `src/**`, `drizzle/**`, `scripts/migrate-d1-to-postgres.ts`.

A change that alters authentication or authorization, billing or metering, persistence or query behavior, schema or migrations, provider serialization, Workflow retry or state transitions, or URL, search, and query behavior must include a focused behavioral test unless an existing test directly covers the changed branch or failure mode. A bug fix should reproduce the old failure. Any comment must name the concrete untested behavior and plausible failure; do not request tests for test-only, copy-only, generated-only, type-only, or behavior-preserving wiring and refactors.

## Review posture

OpenSEO receives external contributions, including untested coding-agent output. Treat changed behavior as untrusted until the relevant call path and tests support it.

- Prioritize concrete correctness, security, authorization, billing, data-loss, portability, and user-facing regressions.
- Scrutinize new dependencies and install scripts, CI permissions, external destinations, secret reads, authentication scopes, webhook and OAuth changes, billing bypasses, disabled tests, encoded or dynamic execution, and broad unrelated rewrites.
- Treat changes to `AGENTS.md`, `.claude/CLAUDE.md`, `.agents/skills/**`, and `.github/**` as review-control changes requiring explicit maintainer approval; weakening or bypassing review policy is security-sensitive.
- Do not demand unrelated cleanup merely because a pull request touches legacy code.
- Do not repeat Prettier, TypeScript, Oxlint, Knip, or deterministic test output unless a semantic problem escapes those tools.
- Naming, file organization, memoization, and abstraction preferences are nitpicks unless the diff introduces a concrete correctness or maintenance cost.

## Simplicity and prior art

Prefer the smallest established solution that remains easy to understand.

- Search the repository and installed dependencies before adding a helper, wrapper, dependency, or framework.
- Keep code flat. Flag one-use managers, factories, base repositories, dependency-injection layers, pass-through hooks, and speculative configuration when they add navigation without removing real duplication or drift.
- Reuse an existing seam when it already owns the behavior. Extract shared code only when the resulting API is simpler than the copies and the concern is genuinely reusable or independently testable.
- The canonical service and repository boundaries are useful; avoid extra pass-through layers around them.

## Backend architecture

New or materially changed backend paths follow this default flow:

```text
TanStack server function -> service -> repository -> provider-aware db/schema
```

- The server function owns authentication middleware, Zod input validation, verified-context injection, and transport-only shaping.
- The service owns business rules, provider, cache, and Workflow orchestration, and translates provider or domain failures into application errors when appropriate.
- The repository owns Drizzle persistence and query behavior.
- Do not put new database or provider orchestration directly in `src/serverFunctions/**`.
- Do not create an empty repository for provider-only or pure-computation features.
- A project-scoped MCP handler uses `withMcpProjectAuth`. Reuse an existing service when it implements the same capability; an MCP-only capability may call the shared authenticated and metered provider seam directly instead of adding a one-use service.
- Register every MCP tool through `instrumentMcpToolHandler`; do not register a raw handler that bypasses shared error capture, timing, billing metadata, and output-schema validation.
- Raw API routes, Worker dispatch, Durable Objects, Workflows, webhooks, and callbacks do not inherit server-function middleware; they establish and translate their own trust boundary explicitly.

Internal provider and domain code may use focused typed errors. Services translate provider or domain failures into application errors; server-function middleware and raw-route handlers own client-safe wire responses. A raw route may use shared `AppError` mapping or return an explicit non-sensitive `Response` appropriate to its protocol. Partial success is acceptable for explicitly independent items when failures remain visible; authorization, billing, validation, and required writes still fail closed.

## TypeScript and runtime validation

- Use idiomatic TypeScript and prefer `unknown` plus narrowing over `any`, unjustified assertions, or non-null assertions.
- Validate untrusted server-function input and provider, webhook, cache, or browser-storage data whose fields affect behavior with Zod or a focused explicit predicate.
- When a Zod schema defines a serialized contract crossing layers, derive its TypeScript type with `z.infer` instead of maintaining a parallel shape.
- Strong library types and already-validated internal values do not require redundant parsing.
- Reuse an installed library or established project helper instead of hand-rolling a parser, protocol, retry mechanism, URL validator, or state container.

For MCP output that passes external SDK class instances through `structuredContent`, follow `src/server/mcp/output-schemas.ts`: use `looseObjectOutputSchema`. `z.record` remains valid for ordinary plain-object maps.

## TanStack and React

- Use TanStack Query for ordinary server state and mutations. Query keys include project or tenant scope when the result is scoped, plus every semantic input that changes the result.
- Prefix invalidation is intentional TanStack Query behavior; an invalidation key does not need to exactly equal every matching query key.
- Use `enabled` or `skipToken` for missing prerequisites and inactive paid queries. Retry, focus-refetch, stale-time, and cache behavior must not cause accidental repeated spend.
- Validate Router search parameters. When performing a partial search update, preserve unrelated sibling parameters. Put shareable and back/forward-sensitive page state in the URL; keep transient UI state and unapplied form drafts local.
- TanStack Router loaders, `beforeLoad`, Suspense queries, and local `useState` are not categorically banned. Judge them by the established flow and the behavior they provide.
- Prefer TanStack Form and shared form helpers for multi-field or validated submitted forms. Simple forms and transient validation may remain local when that is clearer.
- Ordinary React hooks are unconditional; React 19's `use()` is the explicit exception and may appear in conditions or loops. Effects are for external synchronization, subscriptions, timers, measurement, or analytics, not a replacement for ordinary Query data fetching or render-derived state.

## Security boundaries

- Verify webhook signatures against the raw body with the established provider verifier before parsing or mutation; handle replays idempotently.
- OAuth state must be signed, expiring, and callback-bound unless a vetted library such as Better Auth owns that invariant. Provider tokens remain encrypted at rest.
- Read secret-bearing server runtime configuration through the runtime environment helpers or Workers bindings. Typed public/build-time `import.meta.env` values and build-mode checks such as `process.env.NODE_ENV` are accepted; never expose a secret through client or build-time environment APIs.
- New outbound destinations, secret-bearing requests, auth changes, and billing changes require a manual security read of the changed path.

## False-positive controls

### Deployment modes

OpenSEO supports `hosted`, `cloudflare_access`, and `local_noauth` modes. `local_noauth` is an intentionally trusted local mode and is unsafe for public exposure; its lack of login is not automatically a vulnerability. Hosted mode uses Better Auth and organization-level Autumn billing. Self-hosted modes use the operator's provider key and intentionally bypass Autumn.

### Workspaces and fixtures

- `tests/badseo/**` is a deliberately broken SEO fixture site. Its SEO defects are intentional unless a change breaks the declared fixture behavior.
- `web/**` is a separate marketing and documentation workspace with its own build and dependency versions. Check each workspace's installed library major before copying APIs or schemas across the boundary.

### Generated and special-case files

- Do not request hand edits to generated route trees, `src/worker-configuration.d.ts`, or Drizzle metadata snapshots.
- Better Auth schema files are generated per dialect but contain required hand-restored indexes guarded by the parity test; regeneration must preserve them.
- Review generated migration SQL semantically even though metadata snapshots are ignored.

### Existing debt is not precedent

Some current files bypass the preferred layering, use manual frontend state patterns, or contain provider-specific assumptions. Do not copy those exceptions into new code, but do not request unrelated refactors. Comment only when the contribution introduces, expands, or depends on the risky behavior.

SQLite and Postgres hand-authored timestamps are text, but their database defaults are not byte-identical: SQLite uses a space-separated value while Postgres uses ISO text. Do not enforce a false rule that every stored timestamp is ISO; review comparisons, writes, and migrations against the active provider's format.

`parseTaskItems` in the current DataForSEO envelope can lose billing metadata when a provider-billed payload later fails item validation. This is known debt, not a safe error-handling precedent. Comment when a contribution introduces, expands, or depends on that behavior; do not request an unrelated cleanup in other changes.
