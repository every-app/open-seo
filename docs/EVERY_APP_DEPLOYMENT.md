# Deploying the first-party OpenSEO on Every App

> **Status: mergeable, not deployable until the hosted gateway exists.** This runbook needs the hosted Every App gateway at `app.everyapp.com`, its `everyapp register` command, and the gateway's integration proxy holding the DataForSEO, Context and OpenRouter keys. None of it is live yet, and nothing here has run against a real account.

This is the first deploy of OpenSEO as Every App's own first-party app: one pair of Workers in Every App's Cloudflare account, shared by every organization on the gateway, on one Postgres database. It is a different deployment from app.openseo.so, with its own database and customers, and nothing here touches app.openseo.so. Forks of OpenSEO that organizations deploy themselves use `pnpm deploy:everyapp` instead (see [docs/maintainers/every-app.md](./maintainers/every-app.md)).

| What                   | Value                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alchemy stage          | `everyapp` (`deploy/alchemy/alchemy.run.ts`, `deploy/alchemy/alchemy.everyapp.ts`)                                                                                         |
| Workers                | `open-seo-everyapp` (the app) and `open-seo-everyapp-audit` (site audits), bound as `AUDIT_ENGINE`                                                                         |
| Reached at             | `https://openseo.app.everyapp.com`, only through the gateway (`APP__open-seo-everyapp`); no workers.dev URL                                                                |
| Mode                   | `AUTH_MODE=everyapp`, `DEPLOYMENT_TIER=first_party`, no `EVERY_APP_ORG_ID`                                                                                                 |
| Database               | Postgres (PlanetScale) through the Hyperdrive config `open-seo-everyapp`, on both Workers                                                                                  |
| Other resources        | KV `open-seo-kv-everyapp`, R2 `open-seo-r2-everyapp`, the Durable Objects and Workflows suffixed `-everyapp`                                                               |
| Secrets on the Workers | None of DataForSEO, Context, OpenRouter, Autumn, Google or Better Auth. Only the optional `CRAWLER_ACCESS_SECRET`                                                          |
| Gateway binding        | `EVERY_APP_GATEWAY` → `every-app-gateway`, entrypoint `AppGateway`, props `{ organizationId: <platform organization>, appId: "openseo", workerName: "open-seo-everyapp" }` |

## Before you start

- The hosted gateway is installed in Every App's Cloudflare account (`everyapp setup --domain app.everyapp.com --mode hosted`), and its setup claim has created the platform organization, "Every App". OpenSEO must deploy into the same account: service bindings don't cross accounts.
- `pnpm alchemy login` with that account, with `query_cache:write` enabled for Hyperdrive, and `pnpm alchemy cloudflare bootstrap` run once in it for Alchemy's state store. If your default Alchemy profile is another account (app.openseo.so's), log in to a second profile and prefix the deploy with `ALCHEMY_PROFILE=<profile>`.
- `cp deploy/.env.everyapp.example .env.everyapp`, then fill it in as the steps below say.

## 1. Create the database and migrate it

1. Create a PlanetScale Postgres database for this deployment (its own, never app.openseo.so's). Every organization's data lives in it, scoped by organization as on app.openseo.so. Raise `max_connections` to 100 or more: the Hyperdrive config allows 30 origin connections.
2. Put its connection details in `.env.everyapp` as `HYPERDRIVE_ORIGIN_HOST`, `HYPERDRIVE_ORIGIN_PORT` (default 5432), `HYPERDRIVE_ORIGIN_DATABASE`, `HYPERDRIVE_ORIGIN_USER` and `HYPERDRIVE_ORIGIN_PASSWORD`.
3. Run the Postgres migrations against it, naming its URL in the command:

   ```bash
   POSTGRES_DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require' pnpm db:migrate:pg
   ```

   `db:migrate:pg` falls back to `POSTGRES_DATABASE_URL` from `.env.local`, which on a maintainer's machine may be app.openseo.so's database, so always set it in the command. Run it again before any deploy that carries new migrations.

## 2. The Hyperdrive config

There is nothing to create by hand: the deploy creates the Hyperdrive config `open-seo-everyapp` from the `HYPERDRIVE_ORIGIN_*` values (caching off, as on app.openseo.so) and binds it as `HYPERDRIVE` on both Workers.

## 3. The gateway's provider keys

OpenSEO holds no provider keys here. The gateway does, for every app that uses them, and proxies DataForSEO and Context through `/api/integrations/...` and OpenRouter through its AI proxy. From the private-every-app checkout, with the hosted gateway selected:

```bash
pnpm everyapp secret set DATAFORSEO_API_KEY --for gateway
pnpm everyapp secret set CONTEXT_API_KEY --for gateway
pnpm everyapp secret set OPENROUTER_API_KEY --for gateway
```

Don't set them in `.env.everyapp`. The stage never passes them to OpenSEO's Workers, even when the file has them.

## 4. The identity settings

Every request the gateway forwards carries a 120-second RS256 token (`x-everyapp-identity`) that OpenSEO checks against the gateway's public key.

- `EVERYAPP_IDENTITY_PUBLIC_KEYS`: the gateway's identity public key, from its install row in the gateway's D1 (`every-app-gateway`): `SELECT jwt_public_key FROM _everyapp_install WHERE id = 'install'`. It is the key `everyapp deploy` hands every app. Put it in `.env.everyapp` as a single-quoted JSON array on one line, with the PEM's line breaks as `\n` (the example file shows the shape). The deploy refuses to run without it. After a gateway key rotation (private-every-app `docs/runbooks/key-rotation.md`), update it and redeploy.
- `EVERYAPP_GATEWAY_URL` and `EVERYAPP_IDENTITY_ISSUER` default to `https://app.everyapp.com`. The audience is the manifest's id, `openseo`.
- `EVERYAPP_PLATFORM_ORG_ID`: the platform organization's id, the gateway's install organization: `SELECT id FROM organizations ORDER BY created_at LIMIT 1` in the gateway's D1. The gateway binding names it as the organization that owns OpenSEO.
- `CLOUDFLARE_ACCOUNT_ID` and `EVERYAPP_BINDING_API_TOKEN`: the account, and an API token with Workers Scripts: Edit on it, for the gateway binding below.

## 5. Deploy the stage

```bash
pnpm deploy:everyapp:first-party
```

It runs, in order:

1. `vite build --mode everyapp`: the build reads `AUTH_MODE=everyapp` from `.env.everyapp`, so the client shows the Every App account menu and copy. It builds from `wrangler.jsonc` like the other Alchemy stages; Alchemy supplies the bindings.
2. `alchemy deploy --env-file .env.everyapp --stage everyapp`: the audit Worker, then the app's, with the resources above. Add `--dry-run` to the alchemy command the first time and read the plan.
3. `pnpm everyapp:bind-gateway`: binds `EVERY_APP_GATEWAY` on both Workers.

The last step exists because Alchemy can't express the gateway binding. `EVERY_APP_GATEWAY` is a service binding with props, which the gateway trusts because only the account can set them. Alchemy's Cloudflare provider drops `props` from service bindings, and each Alchemy deploy replaces the Workers' whole binding set. So `scripts/everyapp-gateway-binding.ts` patches each Worker's settings through the Cloudflare API after every deploy: it keeps every other binding (`inherit`) and adds the gateway's. Until it has run, provider calls fail closed with "DataForSEO is unavailable". If you ever deploy the stage with `pnpm alchemy deploy` on its own, run `pnpm everyapp:bind-gateway` afterwards.

## 6. Register OpenSEO with the gateway

From the private-every-app checkout, with the hosted gateway selected:

```bash
pnpm everyapp register openseo --worker open-seo-everyapp --shared --manifest <path to this checkout>/everyapp.config.ts
```

This writes the registry row: `scope = 'shared'`, owned by the platform organization, at `openseo.app.everyapp.com`, reached over the service binding `APP__open-seo-everyapp`. After that, any live member of any active organization can open OpenSEO. The token carries the member's `org_id` and `org_role`, and OpenSEO creates the organization and member rows on the first request (see "Two shapes, one mode" in [docs/maintainers/every-app.md](./maintainers/every-app.md)).

## What is not done

- **MCP through the gateway.** OpenSEO's tools are served to the gateway's catalog at `/__everyapp/tools/*`, but the hosted gateway's MCP connector hasn't been tried with this deployment. OpenSEO's own `/mcp` is off in this mode.
- **Google through the gateway.** Search Console and Analytics show as coming. The gateway will hold the Google client for both OpenSEO shapes; OpenSEO's own Google connect and callbacks are off here.
- **Metering through the gateway.** Research spend is only logged per organization (`[research-spend]`). The gateway's wallet will meter the provider calls it proxies. Until then the preview is invite-only, with a per-organization daily cap at the gateway.
- **Scheduled rank checks and AI visibility** are off (`FIRST_PARTY_SCHEDULED_CHECKS` unset). A cron or Workflow has no request, so the gateway can't attribute its provider calls to an organization until the SDK sends `x-everyapp-org` and the gateway verifies it for a trusted shared Worker. Then set `FIRST_PARTY_SCHEDULED_CHECKS=on` and redeploy.

## Where this goes

This stage is the first deploy only. The target is `everyapp deploy` from the manifest (`everyapp.config.ts`), once the CLI has a `hyperdrive` resource and a Postgres migration step. Then this stage, `.env.everyapp`, and the gateway-binding script go away.
