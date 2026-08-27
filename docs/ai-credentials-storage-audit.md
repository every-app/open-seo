# AI Credentials & Settings Storage Audit (Phase S0)

Pre-implementation audit of the AI settings stack, recorded before any Phase S
code changes.

## 1. Current `ai_agent_settings` schema

Both dialects (D1 SQLite `src/db/sam.schema.ts` + drizzle/0039; Postgres
`src/db/pg/sam.schema.ts` + drizzle-pg/0016):

| column | type | notes |
|---|---|---|
| `provider` | text, default `'openrouter'` | provider id |
| `model` | text, default `''` | empty = inherit |
| `organization_id` | text FK → organization.id | set ⇒ org-scope row |
| `project_id` | text FK → projects.id | set ⇒ project-scope row |
| `updated_at` | text timestamp | |

Partial unique indexes enforce **exactly one row per scope**
(`ai_agent_settings_org_idx` / `ai_agent_settings_project_idx`).

**Fields today: `provider` + `model` only.** No base URL, no credentials.

## 2. Scopes already supported

- **Organization**: one row per organization (`getOrganizationAiSettings`).
- **Project**: one row per project (`getProjectAiSettings`); null model deletes
  the row (inherit).
- **Environment**: not persisted — read from deployment env
  (`readAiEnvironment` in `serverFunctions/aiSettings.ts`:
  `AI_AGENT_PROVIDER/MODEL` + per-provider `*_MODEL` vars).

## 3. Are API credentials stored anywhere today?

No. Credentials are deployment-env-only (`OPENROUTER_API_KEY`, …). The
repository comment records the invariant: "Credentials never live in this
table." The settings UI shows masked env status only.

## 4. Existing encryption helper

**Yes — reuse it.** `better-auth/crypto` exports
`symmetricEncrypt` / `symmetricDecrypt` (AES-GCM, random IV, **versioned
envelope** via `formatEnvelope`/`parseEnvelope`). Already a dependency and
already used in production code: self-hosted GSC OAuth encrypts tokens with
`symmetricEncrypt({ key: ctx.secretConfig, data })` keyed from
`BETTER_AUTH_SECRET` (`src/server/features/gsc/selfHostedOAuth.ts`).

Phase S reuses these primitives with a **domain-separated key**
(`${secret}:ai-credentials-v1`) so AI credential ciphertext can never be
cross-decrypted as an OAuth token and vice versa.

## 5. Existing application secret suitable for keying

- `BETTER_AUTH_SECRET` — present in hosted + GSC-enabled self-hosted
  deployments (≥32 chars enforced by preflight). **Primary key source.**
- `AI_CREDENTIALS_ENCRYPTION_KEY` — new optional explicit override for
  deployments that want a dedicated key (also enables credential saving in
  local-noauth runs without a Better Auth secret).

Key selection: `AI_CREDENTIALS_ENCRYPTION_KEY ?? BETTER_AUTH_SECRET`; if
neither is set, credential save/read is unavailable and the UI reports
"credential storage is not configured" (env fallback keeps working). No
hard-coded or dev-default key.

## 6. How environment defaults resolve today

`resolveAiSettings({project, organization}, env)` in
`AiSettingsService.ts`: project row → organization row →
`AI_AGENT_PROVIDER`/`AI_AGENT_MODEL` → per-provider env model → adapter
`defaultModelId`. Provider-aware already: a model that cannot belong to the
effective provider is normalized to null (`validateModelForProvider`).

## 7. Authorization enforcement

- All settings server functions run `requireAuthenticatedContext`
  (session → user + organizationId).
- Project-scoped functions use `requireProjectContext`
  (project membership verified; project id injected server-side).
- Repository queries always filter by the authenticated
  `organizationId`/`projectId` — no cross-scope reads are possible by
  construction.

## 8. Model catalog + cache today

`cachedModels("ai-models:{provider}", fetch)` in `provider-shared.ts`, R2
backed, 12h TTL, shape-guarded. Cache identity is **provider only** — Phase S
must extend it with the normalized Base URL for endpoint providers
(OpenAI-Compatible / Ollama Cloud) plus a refresh-bypass path.

## 9. Connection test today

`provider.testConnection(modelId)` — env credentials only, no override
inputs. Phase S adds unsaved-edit support (provider/model/baseURL/apiKey)
without persistence.

## 10. Gaps Phase S must close

1. Columns: `base_url` (plaintext config) + `credentials` (encrypted JSON map
   provider → key) on `ai_agent_settings`, both dialects + migrations.
2. Crypto wrapper (domain-separated, fail-closed when unkeyed).
3. Provider-aware field-level resolution: provider, model, baseUrl,
   credential — never mixing providers across scopes.
4. Adapter surface: `listModels`/`buildModel`/`testConnection` must accept
   explicit effective config (baseUrl/apiKey) without breaking the env path.
5. Catalog cache identity + refresh-bypass.
6. Server functions: credential set/remove, base URL override/remove, scope
   reset, unsaved-edit connection test, model refresh.
7. UI: inheritance labels, key change/remove, Base URL edit, Refresh models.
