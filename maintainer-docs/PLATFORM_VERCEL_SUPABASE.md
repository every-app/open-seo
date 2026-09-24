# Platform assessment: Vercel + Supabase

Status as of September 2026. Decision: **ship on Cloudflare Workers with
Supabase Postgres now; treat a Vercel runtime as a separate, later project.**

## Why Vercel is not a configuration change

The server side is written against the Cloudflare Workers runtime, not
against Node. Counting the current tree:

| Primitive                                  | Where it is used                                                                                   | Files |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----- |
| `import { env } from "cloudflare:workers"` | env access in services, repositories, auth, MCP, telemetry                                         | ~28   |
| `waitUntil` from `cloudflare:workers`      | fire-and-forget work after the response (telemetry, cache writes, billing sync)                    | ~18   |
| Durable Objects (`agents` SDK)             | `SamChatAgent` (in-app agent, WebSocket + persisted chat), `AuditScratchpad` (crawl frontier)      | 7     |
| Workflows (`WorkflowEntrypoint`)           | `RankCheckWorkflow`, `SiteAuditWorkflow` and their step helpers                                    | 10    |
| KV                                         | `OAUTH_KV` for the MCP OAuth provider; `KV` for caches                                             | 12    |
| R2                                         | Lighthouse/audit payload storage (`src/server/lib/r2.ts`, `r2-cache.ts`)                           | 3     |
| Service bindings / `WorkerEntrypoint`      | main Worker → audit Worker (`AUDIT_ENGINE`)                                                        | 4     |
| `@cloudflare/workers-oauth-provider`       | The MCP server's OAuth 2.1 authorization server (hosted mode)                                      | 1     |
| Cron triggers                              | `scheduled()` in `src/server.ts`: rank checks every 5 min, OAuth GC daily                          | 1     |
| Hyperdrive                                 | Optional Postgres pooling (now optional: `DATABASE_URL` works without it)                          | 2     |
| Build                                      | `@cloudflare/vite-plugin` with an auxiliary Worker; Docker image runs `workerd` via `vite preview` | -     |

Even the Docker self-host path runs the Workers runtime (miniflare/workerd)
rather than Node. There is no Node server entry to point Vercel at.

## What a port would consist of

Ordered so each phase leaves the app deployable on Cloudflare.

1. **Runtime env abstraction.** Replace the 28 direct `env` imports with the
   existing `getOptionalEnvValue` / `getEnvValueSync` helpers in
   `src/server/lib/runtime-env.ts` (already `process.env`-first). Replace
   `waitUntil` with a small `defer()` helper that maps to `waitUntil` on
   Workers and to Vercel's `waitUntil` (from `@vercel/functions`) on Node.
2. **Storage.** R2 → Supabase Storage through its S3-compatible endpoint
   (`@aws-sdk/client-s3`), behind the two functions in `r2.ts`. KV caches →
   a `cache` table in Postgres or Upstash Redis. `OAUTH_KV` → Postgres tables.
3. **MCP OAuth server.** `@cloudflare/workers-oauth-provider` has no Node
   equivalent; replace with Better Auth's OAuth provider plugin (already a
   dependency for the consent screen) or `@node-oauth/oauth2-server`, keeping
   the same endpoints so installed MCP clients keep working.
4. **Background jobs.** Workflows → a durable job runner: Inngest or Trigger.dev
   are the usual Vercel choices, or `pg-boss` on Supabase. `RankCheckWorkflow`
   is a plain step list; `SiteAuditWorkflow` also needs the scratchpad state
   moved from a Durable Object into Postgres tables (frontier, link edges,
   page mirror). Crons → `vercel.json` cron entries calling protected routes.
5. **In-app agent.** `SamChatAgent` is an `AIChatAgent` Durable Object with a
   WebSocket. On Vercel it becomes an HTTP streaming route (Vercel AI SDK
   `streamText`) with messages persisted in Postgres; the client component
   changes from the `agents/react` hook to `@ai-sdk/react`.
6. **Build target.** Swap `@cloudflare/vite-plugin` for TanStack Start's Nitro
   plugin with the `vercel` preset; delete the auxiliary Worker (its code
   moves into the job runner from step 4).
7. **Marketing site (`web/`).** Also TanStack Start on Workers with Turnstile
   and free tools calling the app. Same Nitro swap, or replace the site
   entirely.

Estimate: steps 1 to 2 are mechanical (days). Steps 3 to 5 are each a
feature-sized rewrite with behavior risk (weeks in total). The Postgres
layer, auth, UI, MCP tools and DataForSEO integration carry over unchanged.

## What Supabase covers today

- **Postgres:** supported now via `DATABASE_URL` (transaction pooler) or
  Hyperdrive in front of the session pooler. See `docs/DATABASE_SUPABASE.md`.
- **Storage:** candidate R2 replacement in a port (step 2). Not needed on
  Cloudflare.
- **Auth:** not used. Better Auth owns users, sessions, organizations and API
  keys, and the MCP OAuth flow builds on it. Switching to Supabase Auth would
  touch every server function's user resolution and the organization model
  for no functional gain.
- **Edge Functions / Realtime:** not needed.

## Recommendation

Launch on Cloudflare (free plan is sufficient for early traffic; Workers Paid
at $5/month once Durable Object and Workflow volume grows) with Supabase
Postgres. Revisit a Vercel runtime only if a concrete requirement appears
(existing Vercel-only infrastructure, a team constraint). If it does, do
steps 1 and 2 first: they reduce lock-in without committing to the rest.
