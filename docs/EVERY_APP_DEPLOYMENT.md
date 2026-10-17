# Deploying the first-party OpenSEO on Every App

> **Status: mergeable, not deployable until the hosted gateway exists.** This runbook needs the hosted Every App gateway installed at `app.everyapp.com`, with its integration proxy holding the DataForSEO, Context and OpenRouter keys. The code is on private-every-app `main` (`everyapp register`, the integration proxy, background attribution); no hosted gateway is installed yet, and nothing here has run against a real account.

This is the first deploy of OpenSEO as Every App's own first-party app: one pair of Workers in Every App's Cloudflare account, shared by every organization on the gateway, on one Postgres database. It is a different deployment from app.openseo.so, with its own database and customers, and nothing here touches app.openseo.so. Forks of OpenSEO that organizations deploy themselves use `pnpm deploy:everyapp` instead (see [docs/maintainers/every-app.md](./maintainers/every-app.md)).

| What                   | Value                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alchemy stage          | `everyapp` (`deploy/alchemy/alchemy.run.ts`, `deploy/alchemy/alchemy.everyapp.ts`)                                                                                                              |
| Workers                | `every-everyapp-openseo` (the app) and `every-everyapp-openseo--audit` (site audits), bound as `AUDIT_ENGINE`: the names the gateway's registry gives them (see "The Worker names" below)       |
| Reached at             | `https://openseo.app.everyapp.com`, only through the gateway (`APP__every-everyapp-openseo`); no workers.dev URL                                                                                |
| Mode                   | `AUTH_MODE=everyapp`, `DEPLOYMENT_TIER=first_party`, `EVERYAPP_SHARED=1` on both Workers, `EVERYAPP_AUDIENCE=every-everyapp-openseo` on the app's, no `EVERY_APP_ORG_ID`                        |
| Database               | Postgres (PlanetScale) through the Hyperdrive config `open-seo-everyapp`, on both Workers                                                                                                       |
| Other resources        | KV `open-seo-kv-everyapp`, R2 `open-seo-r2-everyapp`, the Durable Objects and Workflows suffixed `-everyapp`                                                                                    |
| Secrets on the Workers | None of DataForSEO, Context, OpenRouter, Autumn, Google or Better Auth. Only the optional `CRAWLER_ACCESS_SECRET`                                                                               |
| Gateway binding        | `EVERY_APP_GATEWAY` → `every-app-gateway`, entrypoint `AppGateway`, props `{ organizationId: <platform organization>, appId: "openseo", workerName: "every-everyapp-openseo" }` on both Workers |

## Before you start

- The hosted gateway is installed in Every App's Cloudflare account (`everyapp setup --domain app.everyapp.com --mode hosted`), and its setup claim has created the platform organization, "Every App". OpenSEO must deploy into the same account: service bindings don't cross accounts.
- `pnpm alchemy login` with that account, with `query_cache:write` enabled for Hyperdrive, and `pnpm alchemy cloudflare bootstrap` run once in it for Alchemy's state store. If your default Alchemy profile is another account (app.openseo.so's), log in to a second profile and prefix the deploy with `ALCHEMY_PROFILE=<profile>`.
- `cp deploy/.env.everyapp.example .env.everyapp`, then fill it in as the steps below say.
- The queries below run against the gateway's D1 database, `every-app-gateway`, in that account: in the dashboard's D1 console, or from this checkout with `CLOUDFLARE_ACCOUNT_ID=<the account> pnpm exec wrangler d1 execute every-app-gateway --remote --json --command "<query>"`.

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

- `EVERYAPP_IDENTITY_PUBLIC_KEYS`: the gateway's identity public key. It is the `jwt_public_key` column of the gateway's install table, `_everyapp_install`, whose one row has `id = 'install'` (private-every-app `packages/cli/src/lib/gateway/install.ts`); it is the key `everyapp deploy` hands every app. The column holds one SPKI PEM with real line breaks. This prints it as the one-line JSON array the env file takes:

  ```bash
  CLOUDFLARE_ACCOUNT_ID=<the account> pnpm exec wrangler d1 execute every-app-gateway --remote --json \
    --command "SELECT jwt_public_key FROM _everyapp_install WHERE id = 'install'" \
    | jq -c '[.[0].results[0].jwt_public_key]'
  ```

  Put the output in `.env.everyapp` single-quoted (the example file shows the shape). A null or empty result means the gateway's first upload hasn't recorded a key yet: finish `everyapp setup` first. The deploy refuses to run without a key. After a gateway key rotation (private-every-app `docs/runbooks/key-rotation.md`), update it and redeploy. `everyapp register --json` (step 6) prints the same key in `data.worker.identityPublicKeys`, a check that the two agree.

- `EVERYAPP_GATEWAY_URL` and `EVERYAPP_IDENTITY_ISSUER` default to `https://app.everyapp.com`.
- The audience is the app Worker's name. Since private-every-app #304 the gateway mints each identity for the Worker it forwards to (`aud` = `every-everyapp-openseo`), and the SDK answers 500 to every request when `EVERYAPP_AUDIENCE` is unset or different. The stage sets `EVERYAPP_AUDIENCE` on the app's Worker from the Worker name; there is nothing to fill in. The audit Worker verifies no tokens and gets none.
- `EVERYAPP_PLATFORM_ORG_ID`: the platform organization's id, the gateway's install organization, which `everyapp register` registers OpenSEO in: the oldest organization with an owner. This also shows its slug and key, which name the Workers (below):

  ```sql
  SELECT o.id, o.slug, k.org_key FROM organizations o
  LEFT JOIN organization_keys k ON k.organization_id = o.id
  WHERE EXISTS (SELECT 1 FROM members m WHERE m.organization_id = o.id AND m.role = 'owner')
  ORDER BY o.created_at, o.id LIMIT 1
  ```

  The gateway binding names it as the organization that owns OpenSEO.

- `CLOUDFLARE_ACCOUNT_ID` and `EVERYAPP_BINDING_API_TOKEN`: the account, and an API token with Workers Scripts: Edit on it, for the gateway binding below.

### The Worker names

The gateway binds a shared app's Worker only under the name its registry gives it, `every-<platform organization key>-openseo`, and `everyapp register` refuses any other. The platform organization "Every App" has the slug `every-app`, so its key is `everyapp` and the Workers are `every-everyapp-openseo` and its helper `every-everyapp-openseo--audit` (helper Workers are `<app worker>--<name>`). The key is claimed the first time the organization registers an app: the slug's letters and digits, at most 12, with `2`, `3`, … appended if another organization holds it. If the query above shows another `org_key`, or none yet and the slug isn't `every-app`, set `EVERYAPP_WORKER_NAME=every-<key>-openseo` in `.env.everyapp`; the stage and the binding script both read it. When unsure, deploy with the default: step 6 says exactly which name the gateway wants.

## 5. Deploy the stage

```bash
pnpm deploy:everyapp:first-party
```

It runs, in order:

1. `vite build --mode everyapp`: the build reads `AUTH_MODE=everyapp` from `.env.everyapp`, so the client shows the Every App account menu and copy. It builds from `wrangler.jsonc` like the other Alchemy stages; Alchemy supplies the bindings.
2. `alchemy deploy --env-file .env.everyapp --stage everyapp`: the audit Worker, then the app's, with the resources above. Add `--dry-run` to the alchemy command the first time and read the plan.
3. `pnpm everyapp:bind-gateway`: binds `EVERY_APP_GATEWAY` on both Workers. A Cloudflare API failure names the URL and HTTP status.

The last step exists because Alchemy can't express the gateway binding. `EVERY_APP_GATEWAY` is a service binding with props, which the gateway trusts because only the account can set them. Alchemy's Cloudflare provider drops `props` from service bindings, and each Alchemy deploy replaces the Workers' whole binding set. So `scripts/everyapp-gateway-binding.ts` patches each Worker's settings through the Cloudflare API after every deploy: it keeps every other binding (`inherit`) and adds the gateway's. Until it has run, provider calls fail closed with "DataForSEO is unavailable". If you ever deploy the stage with `pnpm alchemy deploy` on its own, run `pnpm everyapp:bind-gateway` afterwards.

## 6. Register OpenSEO with the gateway

From the private-every-app checkout, with the hosted gateway selected:

```bash
pnpm everyapp register openseo --worker every-everyapp-openseo --shared --manifest <path to this checkout>/everyapp.config.ts
```

This writes the registry row: `scope = 'shared'`, owned by the platform organization, at `openseo.app.everyapp.com`, reached over the service binding `APP__every-everyapp-openseo`. After that, any live member of any active organization can open OpenSEO. The token carries the member's `org_id` and `org_role`, and OpenSEO creates the organization and member rows on the first request (see "Two shapes, one mode" in [docs/maintainers/every-app.md](./maintainers/every-app.md)).

If it stops with `WORKER_NAME_MISMATCH`, the platform organization's key isn't `everyapp`, and the error names the exact Worker the gateway binds ("The gateway names openseo's Worker every-…-openseo, and binds no other"). Set `EVERYAPP_WORKER_NAME` to that name in `.env.everyapp`, run `pnpm deploy:everyapp:first-party` again, delete the two Workers deployed under the old name, and register with `--worker <that name>`.

## Whose calls they are

Both Workers have `EVERYAPP_SHARED=1`: one Worker pair serves every organization, so every DataForSEO, Context and OpenRouter call through the gateway says whose it is.

- Calls made while serving a request (pages, server functions, the gateway's tool calls) forward the request's identity.
- Workflows (rank checks, AI visibility, site audits) and SAM's turns name the organization that owns the work, sent as `x-everyapp-org`. The gateway accepts it only for an active organization with a live member, and refuses it with 403 otherwise.
- A call that names nobody is refused inside OpenSEO before it leaves (`AttributionError`).

The mechanism is in [docs/maintainers/every-app.md](./maintainers/every-app.md) ("Whose call it is").

**Scheduled rank checks and AI visibility run**, attributed like any other Workflow. Set `FIRST_PARTY_SCHEDULED_CHECKS=off` in `.env.everyapp` and redeploy to hold them, for example while the first-party deployment's provider spend is being watched.

**SAM chats renew their sign-in every 15 minutes.** OpenSEO authorizes a SAM WebSocket when it connects, and its member rows mirror the gateway's without ever being removed, so each socket closes 15 minutes after it connects and the client reconnects through the gateway, which signs a fresh identity or refuses someone it no longer lets in. A member removed at the gateway can keep chatting for at most that long.

## What is not done

- **MCP through the gateway.** OpenSEO's tools are served to the gateway's catalog at `/__everyapp/tools/*`, but the hosted gateway's MCP connector hasn't been tried with this deployment. OpenSEO's own `/mcp` is off in this mode.
- **Google through the gateway.** Search Console and Analytics show as coming. The gateway will hold the Google client for both OpenSEO shapes; OpenSEO's own Google connect and callbacks are off here.
- **Metering through the gateway.** Research spend is only logged per organization (`[research-spend]`). Every provider call is attributed to an organization at the gateway, which has no usage limits yet; the gateway's wallet will meter them. Until then the preview is invite-only.
- **Membership inside a SAM socket's lifetime.** A removed member keeps an open SAM chat for up to 15 minutes; a per-turn membership check at the gateway would close that window.

## Where this goes

This stage is the first deploy only. The target is `everyapp deploy` from the manifest (`everyapp.config.ts`), once the CLI has a `hyperdrive` resource and a Postgres migration step. Then this stage, `.env.everyapp`, and the gateway-binding script go away.
