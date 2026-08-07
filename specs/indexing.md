# OpenSEO — Indexing & Bing Visibility (IndexNow Autopilot)

**Status:** In progress — Phase 1 (IndexNow Autopilot) being built.
**Owner:** Hephaestus (codex-pro) via Poseidon orchestration.
**Repo:** `/Users/ramai/Projects/open-seo` (branch `main`).

## Goal / Differentiator

OpenSEO should not merely *report* SEO problems — it should **detect changes, submit
fixes, verify search-engine response, and tell the operator what to do next.** This
feature set (IndexNow + Bing Webmaster) is that differentiator.

## Phased plan (Ramon-approved order)

1. **IndexNow Autopilot** — submit URL changes to IndexNow (Bing/Yandex/Seznam/Naver),
   with a submission queue, batching, retries, and an event ledger. *(current phase)*
2. **Bing OAuth + read-only telemetry** — connect Bing Webmaster via OAuth
   (`webmaster.read` / `webmaster.manage`), surface crawl/visibility data.
3. **War Room + MCP wiring** — expose both to the War Room and as MCP tools.
4. **Deployment/webhook triggers** — auto-submit on deploy/webhook. *(last)*

---

## Architecture to mirror (GSC is the template)

Reuse the exact GSC patterns. Do NOT invent new conventions.

| Concern | GSC reference | Replicate for |
|---|---|---|
| OAuth config | `src/server/features/gsc/oauth-config.ts` | `bing/oauth-config.ts` |
| Self-hosted OAuth | `src/server/features/gsc/selfHostedOAuth.ts` | `bing/selfHostedOAuth.ts` |
| API client | `src/server/lib/gscClient.ts` | `src/server/lib/indexnowClient.ts`, `src/server/lib/bingClient.ts` |
| Service | `src/server/features/gsc/services/GscService.ts` | `indexnow/services/IndexNowService.ts`, `bing/services/BingService.ts` |
| Repository | `src/server/features/gsc/repositories/GscConnectionRepository.ts` | per-table repositories |
| Shared constants | `src/shared/gsc.ts` | `src/shared/indexnow.ts`, `src/shared/bing.ts` |
| Schema (both dialects) | `src/db/gsc.schema.ts` + `src/db/pg/gsc.schema.ts` | new tables in both |
| MCP tool | `src/server/mcp/tools/gsc-second-page.ts` | new tool files |
| Route | `src/routes/api/gsc/oauth/callback.ts` | `src/routes/api/bing/oauth/callback.ts` |
| Client page | `src/client/features/search-performance/` | `src/client/features/indexing/` |
| Sidebar | `src/client/navigation/items.ts` | add "Indexing" item |

### Key conventions (must follow)

- **Dual-dialect schema:** every new table must be defined in BOTH
  `src/db/*.schema.ts` (sqlite) and `src/db/pg/*.schema.ts` (postgres), then added to
  the barrels: `src/db/schema.ts` (AppSchema type + runtime spread + destructure),
  `src/db/d1/schema.ts` (sqlite barrel). `src/db/schema-parity.test.ts` asserts the two
  dialects are structurally interchangeable — keep them identical.
- **Timestamps:** sqlite uses `sql\`(current_timestamp)\``; pg uses
  `isoNow = sql\`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')\``.
- **Migrations:** `npm run db:generate` (runs d1 + pg). Commit both `drizzle/*.sql` and
  `drizzle-pg/*.sql`. Do NOT hand-edit migrations.
- **OAuth tokens** live in the better-auth `account` table under a providerId; the
  connection table only records which property maps to a project + whose grant to use.
  Access tokens are minted/refreshed via `getAuth().api.getAccessToken({ body: {
  providerId, userId, accountId } })` (see `gscClient.ts` `getToken`).
- **MCP tools:** one file per tool in `src/server/mcp/tools/`, exported as
  `{ name, config, handler }`, handler wrapped with `withMcpProjectAuth` for
  project-scoped tools, registered explicitly in `src/server/mcp/server.ts` via
  `instrumentMcpToolHandler`. Use `mcpResponse({ text, structuredContent })`.
- **Errors:** `AppError` from `@/server/lib/errors` for user-facing failures;
  feature-specific error classes (e.g. `GscNotConnectedError`) for not-connected.
- **Repositories** import tables from `@/db/schema` and the provider-aware `db` from
  `@/db` so each is written ONCE for both backends.

---

## Phase 1 — IndexNow Autopilot (build now)

### New tables (both dialects)

**`indexnow_configs`** — one per project.
- `id` text PK
- `projectId` text notNull, references projects.id onDelete cascade, **unique**
- `organizationId` text notNull, references organization.id onDelete cascade
- `host` text notNull — the domain to submit for (e.g. `example.com`)
- `key` text notNull — the IndexNow key (hex string)
- `keyLocation` text notNull — URL where the key file is hosted
  (e.g. `https://example.com/<key>.txt`)
- `enabled` integer/boolean notNull default true
- `createdAt`, `updatedAt` text notNull default now
- uniqueIndex on projectId; index on organizationId

**`indexing_events`** — event ledger.
- `id` text PK
- `projectId` text notNull, references projects.id onDelete cascade
- `organizationId` text notNull, references organization.id onDelete cascade
- `url` text notNull
- `eventType` text notNull — one of `submitted` | `verified` | `failed` | `expired`
- `status` text notNull — e.g. `pending` | `success` | `error`
- `httpStatus` integer nullable — IndexNow response status
- `responseBody` text nullable — truncated response
- `attempts` integer notNull default 0
- `createdAt`, `updatedAt` text notNull default now
- index on (projectId, createdAt); index on organizationId

### IndexNow client — `src/server/lib/indexnowClient.ts`

- `POST https://api.indexnow.org/indexnow` with JSON body
  `{ host, key, keyLocation, urlList: string[] }`.
- Map statuses: `200`/`202` = submitted; `400` = invalid request; `403` = key not
  verified; `422` = URLs not on host; `429` = rate limited (retryable).
- Define `IndexNowApiError` (with status) and a retryable flag.
- Batch limit: max 10,000 URLs per request (IndexNow spec). Keep batches small
  (e.g. 100) for the queue.

### IndexNow feature — `src/server/features/indexnow/`

- `repositories/IndexNowConfigRepository.ts` — getByProjectId, upsert, deleteByProjectId.
- `repositories/IndexingEventRepository.ts` — insert, listByProjectId (paginated),
  markAttempted, markResult.
- `services/IndexNowService.ts`:
  - `submitUrls({ projectId, urls })` — resolve config, batch, POST, record events.
  - `getQueue({ projectId })` — pending/recent events.
  - `verifyKey({ projectId })` — GET the keyLocation, confirm it serves the key.
  - `getConfig` / `setConfig` / `disable`.
- Batching + retries: retry `429`/network errors with backoff (e.g. 3 attempts);
  record each attempt in the ledger.

### MCP tools (Phase 1)

- `submit_indexnow_urls` — `{ projectId, urls: string[] }` → submit + return ledger result.
- `get_indexing_queue` — `{ projectId, limit? }` → recent events.

### Route + sidebar (Phase 1)

- New project route `src/routes/_project/p/$projectId/indexing.tsx` → renders
  `src/client/features/indexing/IndexingPage.tsx`.
- Sidebar: add `{ to: "/p/$projectId/indexing", label: "Indexing", icon: <lucide> }`
  to `projectNavItems` in `src/client/navigation/items.ts`, and add it to the
  "My Site" group in `getProjectNavGroups`.
- Page: config card (host/key/keyLocation/enabled), submit-URL form, queue/ledger table.

---

## Phase 2 — Bing OAuth + read-only telemetry (next)

- `bing_connections` table (mirror `gsc_connections`).
- `src/shared/bing.ts`: `BING_OAUTH_PROVIDER_ID = "bing-webmaster"`,
  `BING_OAUTH_SCOPES = ["webmaster.read", "webmaster.manage"]`.
- Bing OAuth: `oauth-config.ts`, `selfHostedOAuth.ts`, route
  `src/routes/api/bing/oauth/callback.ts`. Hosted uses OAuth; self-hosted falls back to
  API-key entry.
- `src/server/lib/bingClient.ts` — Webmaster API client (crawl issues, visibility).
- MCP tools: `get_bing_visibility`, `get_bing_crawl_issues`.

## Phase 3 — War Room + MCP wiring (next)

- Surface IndexNow + Bing telemetry in the War Room (`src/serverFunctions/war-room.ts`).
- Ensure all four MCP tools are registered and documented.

## Phase 4 — deployment/webhook triggers (last)

- Auto-submit changed URLs on deploy/webhook (e.g. Vercel deploy hook → IndexNow).

---

## Verification (must pass before reporting done)

- `npm run db:generate` produces clean migrations for both dialects; no drift.
- `src/db/schema-parity.test.ts` passes (sqlite vs pg structural parity).
- `npx tsc --noEmit` (or the repo's typecheck) passes.
- Repo lint (`npm run lint` / oxlint) passes.
- New MCP tools registered and importable; unit tests for client + service added.
- Do NOT run `db:migrate:prod` or deploy. Local migration only.
