# OpenSEO on an Every App gateway

`AUTH_MODE=everyapp` runs OpenSEO as an app behind an [Every App](https://everyapp.dev) gateway. The gateway does what a self-hoster otherwise sets up per deployment:

| Concern                            | Other self-host modes                                             | `everyapp`                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, sign-out, who may open it | Cloudflare Access, or none                                        | The gateway's users, organizations, roles and per-app access                                                                 |
| User and workspace                 | Access `sub` → `user` row, one shared workspace, everyone `owner` | Gateway `sub` → `user` row; the workspace and role come from the signed identity (see the two shapes below)                  |
| Teams, invitations, ownership      | None                                                              | The gateway's; OpenSEO's team UI and server functions are off                                                                |
| MCP                                | `/mcp` behind Access Managed OAuth                                | The gateway's one MCP connector lists OpenSEO's tools as `openseo_<tool>`; OpenSEO's own `/mcp` and `oseo_` API keys are off |
| DataForSEO                         | `DATAFORSEO_API_KEY` on the deployment                            | The gateway holds it; calls go over the gateway binding                                                                      |
| Context.dev (rendered audits)      | `CONTEXT_API_KEY` on the deployment                               | The gateway holds it, as for DataForSEO                                                                                      |
| OpenRouter                         | `OPENROUTER_API_KEY` on the deployment                            | The gateway's AI proxy holds it                                                                                              |
| Search Console and Analytics       | OpenSEO's own Google client                                       | The gateway will hold Google (designed, not built); until then they show as coming and OpenSEO's own callbacks answer 404    |
| Site-audit engine                  | The `open-seo-audit` Worker                                       | The app's helper Worker, `<app worker>--audit`                                                                               |
| Billing, Turnstile, Loops, PostHog | Off (hosted only)                                                 | Off; the gateway meters provider calls and will bill them                                                                    |

## Two shapes, one mode

Identity is the same in both; three settings pick the shape.

|                                         | First party                                                                                         | Fork                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Who deploys it                          | Every App, into its own Cloudflare account                                                          | An organization, as its own app (Workers for Platforms later) |
| Organizations                           | Every organization on the gateway, from one Worker                                                  | One                                                           |
| `EVERY_APP_ORG_ID`                      | Unset: the organization comes from each request's identity                                          | Set by the deploy: OpenSEO is pinned to that organization     |
| `DATABASE_PROVIDER`                     | `postgres`, through a `HYPERDRIVE` binding on both Workers                                          | `d1` (the manifest's `DB`)                                    |
| Tier (`DEPLOYMENT_TIER`)                | `first_party` (derived when unset)                                                                  | `fork` (derived when unset)                                   |
| Scheduled rank checks and AI visibility | Off until the gateway attributes background calls (`FIRST_PARTY_SCHEDULED_CHECKS=on` turns them on) | On                                                            |

**First party.** The token's `org_id` is OpenSEO's organization id. The first request from a member of a new organization creates the `organization` row (slug `everyapp-<hex of the id>`), the `user` row keyed by `sub`, and a `member` row with the mapped role; each isolate remembers what it has written, so later requests make no writes. Every product table already hangs off `organization_id` or `project_id`, as on app.openseo.so, so organizations stay apart without new code. The `member` row only mirrors the gateway: authorization always reads the organization and role from the signed token on the request, so a member the gateway removes has no way back in, whatever rows remain. MCP tool calls are `orgScope: "pinned"` to the token's organization for the same reason.

**Fork.** Everyone the gateway lets in works in one shared workspace (the `shared-workspace` organization) with their gateway role, and a token for any other organization is refused.

**Roles.** The gateway's `owner`, `admin` and `member` are OpenSEO's; anything else is `member`.

## Plan limits off app.openseo.so

Limits read the deployment tier (`src/server/lib/deployment-tier.ts`), not `AUTH_MODE`; Autumn stays hosted-only.

- **Site audits** use the `every_app` tier in both shapes: the paid plan's pages per audit and total capacity, but two audits at a time per organization instead of unlimited.
- **Research spend** is logged per organization (`[research-spend]`) instead of charged; the gateway meters the provider calls it proxies and will bill them through its wallet. Until then the preview is invite-only with a per-organization daily cap at the gateway.
- **Scheduled work.** A cron or Workflow has no request, so the SDK sends no organization with its gateway calls and the gateway can neither meter nor cap them per organization. In the first-party shape the five-minute cron therefore starts no scheduled rank checks or AI visibility runs until the SDK sends `x-everyapp-org` from background work and the gateway verifies it; then set `FIRST_PARTY_SCHEDULED_CHECKS=on`. The stale-audit reconcile still runs.

## How it works

- **Identity** (`src/middleware/ensure-user/everyApp.ts`). The gateway signs a 120-second RS256 token onto every request it forwards (`x-everyapp-identity`, key id `everyapp-identity`, issuer `EVERYAPP_IDENTITY_ISSUER`, audience `EVERYAPP_APP_ID`). The Worker entry rejects any request without a valid one before routing (`src/server.ts`), and `resolveEveryAppContext` maps it to a user, organization and role as above.
- **Cookies.** The gateway strips every inbound `Cookie` header, so OpenSEO's server reads none in this mode, and it refuses requests that repeat its own session cookie's name. Better Auth's routes are hosted-only, so OpenSEO never issues a session cookie here, and the Worker entry drops any `Set-Cookie` behind the gateway (`src/server/everyapp/cookies.ts`). Client-side preferences (the sidebar state, privacy choices) stay in the browser.
- **Providers** (`src/server/lib/provider-access.ts`, `src/server/lib/openrouter.ts`). DataForSEO and Context calls go through `integrationFetch` from `@every-app/sdk/server`, OpenRouter calls through `createGatewayFetch`. No key is ever in OpenSEO. The manifest's `capabilities` name what it calls; `integrationStatus` drives the "set up DataForSEO" prompt and whether audits can render pages.
- **Google** (`src/server/features/google/googleAccess.ts`). The seam for the gateway's Google integration. Until it exists, OpenSEO's own Google client is ignored in this mode even if set, Search Console and Analytics show as coming to Every App, and `/api/gsc/oauth/callback` and `/api/ga4/oauth/callback` answer 404.
- **MCP tools** (`src/server/everyapp/tools.ts`). One list, `registerOpenSeoTools`, feeds both OpenSEO's own MCP server and the gateway's catalog, so a new tool reaches both. Read-only tools are `read`; deleting saved work is `destructive`, which the gateway hides from AI clients until it has approvals; everything else is `write`. Tools return OpenSEO's text for the model and their structured result for clients. `whoami` reports the mode as `Every App (first party)` or `Every App (fork)`.
- **Account menu.** Shows the person from the identity, no organization switcher and no billing; "Sign out on Every App" opens the gateway (`GATEWAY_URL`, or the identity issuer in local dev), where sign-out happens.
- **Build** (`cloudflare.config.ts`, `vite-plugin-every-app.ts`). With `AUTH_MODE=everyapp`, `vite.config.ts` swaps the Cloudflare Vite plugin 1.x and `wrangler.jsonc` for plugin 2.x and `cloudflare.config.ts`: the app's Worker from `everyAppWorker()`, and the site-audit engine (`src/audit-worker.ts`) as its helper Worker from `everyAppAuxiliaryWorker()`. The client build reads the same `AUTH_MODE`, so it shows the Every App copy. Every other build still uses `wrangler.jsonc`.
- **Manifest** (`everyapp.config.ts`). One manifest for both shapes: resources (D1 and KV for the fork shape, which classes the audit Worker defines), the helper Worker, the provider and capability requests, migrations, and the build and dev commands. `public` is empty: report sharing and OpenSEO's other unauthenticated routes are hosted-only, and the gateway's tool calls carry their own tokens.

## Run it locally

From a checkout with the Every App repository beside it (`../private-every-app`, linked in `package.json` as `link:` dependencies until the SDK and CLI are published; build the SDK there with `pnpm -C packages/sdk build`):

```bash
pnpm install
pnpm dev:everyapp        # everyapp dev, with AUTH_MODE=everyapp
```

`everyapp dev` applies the migrations to a local database in `.cloudflare/state` (not the `.wrangler/state` of `pnpm dev`), then starts a gateway-lite on `http://openseo.localhost:8787` with a seeded owner, the real identity checks with the dev key (`everyapp-identity-dev`, accepted only under `EVERYAPP_DEV=1`, which `everyapp dev` sets), and `/mcp` served from OpenSEO's tool catalog (send any `Authorization: Bearer` value). Both Workers run, sharing the database, KV and R2. With no gateway locally, DataForSEO, Context and OpenRouter use your own `DATAFORSEO_API_KEY`, `CONTEXT_API_KEY` and `OPENROUTER_API_KEY` from `.dev.vars`, where `everyapp dev` also writes its dev keys (`.env.local` isn't read once `.dev.vars` exists).

`everyapp dev` sets no `EVERY_APP_ORG_ID`, so local runs are the first-party shape on D1: the dev user's organization becomes OpenSEO's organization. To try the fork shape, set `EVERY_APP_ORG_ID` in `.dev.vars` to the dev user's organization id (`everyapp dev` prints it).

## Deploy it

**Fork shape**, to the gateway `everyapp login` points at:

```bash
pnpm deploy:everyapp     # everyapp app deploy
```

`everyapp app deploy` always sends `EVERY_APP_ORG_ID` (the deploying organization), which is what makes it a fork. The deploy provisions the database and KV, builds both Workers, checks them against the gateway's app policy, applies migrations, and uploads the audit Worker before the app's. The gateway holds the provider keys for every app that uses them (`everyapp gateway secret set DATAFORSEO_API_KEY`, and `CONTEXT_API_KEY`, `OPENROUTER_API_KEY`). OpenSEO's one optional setting of its own is `CRAWLER_ACCESS_SECRET` (`everyapp app secret set`), which audits of protected sites need.

**First-party shape.** Every App deploys it into its own account as a shared app (`scope = 'shared'`, owned by the platform organization, at `openseo.<gateway host>`), with `DATABASE_PROVIDER=postgres` and a `HYPERDRIVE` binding on both Workers and no `EVERY_APP_ORG_ID` (a deploy path that sends one would pin every organization out but one). The CLI doesn't provision Hyperdrive or run Postgres migrations yet, so until it does the Alchemy stage `everyapp` deploys it (`pnpm deploy:everyapp:first-party`, runbook in [docs/EVERY_APP_DEPLOYMENT.md](../EVERY_APP_DEPLOYMENT.md)); no provider, Autumn or Google secret goes on either Worker.

## What isn't done

- **A live deploy** of either shape.
- **Google at the gateway**, which Search Console and Analytics wait for.
- **Background organization attribution** (`x-everyapp-org`), which first-party scheduled checks wait for, and which per-organization metering of workflow calls (site audits, manual rank checks) needs too.
- **The CLI and SDK rename to `capabilities`.** The manifest uses the gateway's new name; the linked SDK at the handed-over commit still reads `integrations` when it declares local dev keys, so until the SDK link moves to the commit that lands the rename, set the provider keys for local dev in `.dev.vars` and expect `everyapp dev` not to pass them through.
- **Publishing.** `@every-app/sdk` and `everyapp` are linked from a checkout. CI on this branch can't install them until they're on npm.
- **Long tools.** The gateway gives a tool call 30 seconds. Most OpenSEO tools return well within it; prompt exploration and some research can take longer.
