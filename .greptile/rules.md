# OpenSEO review context

## Review posture

OpenSEO receives external contributions, including untested coding-agent output. Treat changed behavior as untrusted until the relevant call path and tests support it.

- Prioritize concrete correctness, security, authorization, billing, data-loss, portability, and user-facing regressions.
- Scrutinize new dependencies and install scripts, CI permissions, external destinations, secret reads, authentication scopes, webhook and OAuth changes, billing bypasses, disabled tests, encoded or dynamic execution, and broad unrelated rewrites.
- Treat changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` as review-control changes requiring explicit maintainer approval; weakening or bypassing review policy is security-sensitive.
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

- `badseo/**` is a deliberately broken SEO fixture site. Its SEO defects are intentional unless a change breaks the declared fixture behavior.
- `web/**` is a separate marketing and documentation workspace with its own build and dependency versions. Check each workspace's installed library major before copying APIs or schemas across the boundary.

### Generated and special-case files

- Do not request hand edits to generated route trees, `worker-configuration.d.ts`, or Drizzle metadata snapshots.
- Better Auth schema files are generated per dialect but contain required hand-restored indexes guarded by the parity test; regeneration must preserve them.
- Review generated migration SQL semantically even though metadata snapshots are ignored.

### Existing debt is not precedent

Some current files bypass the preferred layering, use manual frontend state patterns, or contain provider-specific assumptions. Do not copy those exceptions into new code, but do not request unrelated refactors. Comment only when the contribution introduces, expands, or depends on the risky behavior.

SQLite and Postgres hand-authored timestamps are text, but their database defaults are not byte-identical: SQLite uses a space-separated value while Postgres uses ISO text. Do not enforce a false rule that every stored timestamp is ISO; review comparisons, writes, and migrations against the active provider's format.

`parseTaskItems` in the current DataForSEO envelope can lose billing metadata when a provider-billed payload later fails item validation. This is known debt, not a safe error-handling precedent. Comment when a contribution introduces, expands, or depends on that behavior; do not request an unrelated cleanup in other changes.
