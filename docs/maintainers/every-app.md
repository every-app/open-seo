# OpenSEO on an Every App gateway

`AUTH_MODE=everyapp` runs OpenSEO as an app behind an [Every App](https://everyapp.com) gateway. The gateway does what a self-hoster otherwise sets up per deployment:

| Concern                            | Other self-host modes                                             | `everyapp`                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, sign-out, who may open it | Cloudflare Access, or none                                        | The gateway's users, organizations, roles and per-app access                                                                                   |
| User and workspace                 | Access `sub` → `user` row, one shared workspace, everyone `owner` | Gateway `sub` → `user` row; the workspace and role come from the signed identity (see the two shapes below)                                    |
| Teams, invitations, ownership      | None                                                              | The gateway's; OpenSEO's team UI and server functions are off                                                                                  |
| MCP                                | `/mcp` behind Access Managed OAuth                                | The gateway's one MCP connector lists OpenSEO's tools as `openseo_<tool>`; OpenSEO's own `/mcp` and `oseo_` API keys are off                   |
| DataForSEO                         | `DATAFORSEO_API_KEY` on the deployment                            | The gateway holds it; calls go over the gateway binding                                                                                        |
| Context.dev (rendered audits)      | `CONTEXT_API_KEY` on the deployment                               | The gateway holds it, as for DataForSEO; optional, audits run unrendered without it                                                            |
| OpenRouter                         | `OPENROUTER_API_KEY` on the deployment                            | The gateway's AI proxy holds it                                                                                                                |
| Search Console and Analytics       | OpenSEO's own Google client                                       | The gateway holds the Google client; members connect Google in the gateway, and reads go through its proxy. OpenSEO's own callbacks answer 404 |
| Site-audit engine                  | The `open-seo-audit` Worker                                       | The app's helper Worker, `<app worker>--audit`                                                                                                 |
| Billing, Turnstile, Loops, PostHog | Off (hosted only)                                                 | Off; the gateway meters provider calls and will bill them                                                                                      |

## One shape

An organization installs OpenSEO onto its own gateway (`pnpm everyapp install https://github.com/every-app/open-seo`); the deploy sets `EVERY_APP_ORG_ID`, which pins the install to that organization. Everyone the gateway lets in works in one shared workspace (the `shared-workspace` organization) with their gateway role, and a token for any other organization is refused. The database is the manifest's D1 (`DB`). This has nothing to do with the Docker edition.

A shared deployment that would serve every organization on a gateway from one Worker (the shape everyapp.team was once planned to run) is not built.

**Roles.** The gateway's `owner`, `admin` and `member` are OpenSEO's; anything else is `member`.

## Plan limits off app.openseo.so

Autumn stays hosted-only.

- **Site audits** use the self-hosted limits: each install pays for its own crawls.
- **Research spend** is not charged in OpenSEO; the gateway meters the provider calls it proxies and caps them per day.
- **Scheduled work.** The five-minute cron starts due rank checks and AI visibility runs. It calls no provider itself; each run is a Workflow whose gateway calls are the install's organization's background work (below).

## How it works

- **Identity** (`src/middleware/ensure-user/everyApp.ts`). The gateway signs a 120-second RS256 token onto every request it forwards (`x-everyapp-identity`, key id `everyapp-identity`, issuer `EVERYAPP_IDENTITY_ISSUER`, audience `EVERYAPP_AUDIENCE`, the app Worker's own name). The Worker entry rejects any request without a valid one before routing (`src/server.ts`), and `resolveEveryAppContext` maps it to a user, organization and role as above. The SDK answers 500 when `EVERYAPP_AUDIENCE` is unset: `everyAppWorker()` sets it, and the Alchemy stage sets it on the app's Worker (the audit Worker verifies no tokens).
- **Cookies.** The gateway strips every inbound `Cookie` header, so OpenSEO's server reads none in this mode, and it refuses requests that repeat its own session cookie's name. Better Auth's routes are hosted-only, so OpenSEO never issues a session cookie here, and the SDK's `everyApp()` drops any `Set-Cookie` on the way out. Client-side preferences (the sidebar state, privacy choices) stay in the browser.
- **Providers** (`src/server/lib/provider-access.ts`, `src/server/lib/openrouter.ts`). DataForSEO and Context calls go through `integrationFetch` from `@every-app/sdk/server`, OpenRouter calls through `createGatewayFetch`. No key is ever in OpenSEO. The manifest's `capabilities` name what it calls; `integrationStatus` drives the "set up DataForSEO" prompt and whether audits can render pages, and needs no organization. A refusal the gateway makes itself is read with the SDK's `gatewayRefusal`: a spent daily cap shows as rate limited, a missing key as DataForSEO not set up, anything else as a setup error.
- **Whose call it is** (`src/server/lib/gateway-attribution.ts`). The gateway counts every provider call against the install's organization. While OpenSEO serves a request the gateway forwarded (a page, a server function, a tool call), the request's signed identity is forwarded with the call (`for: request`), so the gateway also knows whose it was; `src/server.ts` and `src/server/everyapp/tools.ts` open that scope. Work no request started (Workflows, SAM's turns, the cron) and work that outlives its token (120 seconds) is the organization's background work (`for: { background: true }`).
- **SAM sockets.** The Worker authorizes a SAM WebSocket once, when it connects, and the `member` row is a mirror that nothing removes, so a removed member's open chat would keep working until it closed. The gateway closes each WebSocket 15 minutes after the handshake; the client reconnects through the gateway, which signs a fresh identity or refuses someone it no longer lets in.
- **Google** (`src/server/features/google/googleAccess.ts`, `gatewayGoogle.ts`). The gateway holds the Google OAuth client (`GOOGLE_WORKSPACE_CLIENT_ID` and `GOOGLE_WORKSPACE_CLIENT_SECRET`, the manifest's optional `google-workspace` capability) and the organization's connection, which an owner or admin makes once (OpenSEO's Connect button, or Every App → Manage workspace → Providers → Connect for the organization); everyone in the workspace reads Search Console and GA4 through it. OpenSEO's own Google client is ignored in this mode even if set, its connect flow is off, and `/api/gsc/oauth/callback` and `/api/ga4/oauth/callback` answer 404.
- **MCP tools** (`src/server/everyapp/tools.ts`). One list, `registerOpenSeoTools`, feeds both OpenSEO's own MCP server and the gateway's catalog, so a new tool reaches both. Read-only tools are `read` and every other tool is `write`, deletes included: the gateway hides `destructive` tools from AI clients until it has an approval step, and every OpenSEO tool should reach them. Tools return OpenSEO's text for the model and their structured result for clients. `whoami` reports the mode as `Every App`.
- **Account menu.** Shows the person from the identity, no organization switcher and no billing; "Sign out on Every App" opens the gateway (`GATEWAY_URL`, or the identity issuer in local dev), where sign-out happens.
- **Build** (`cloudflare.config.ts`, `vite-plugin-every-app.ts`). With `AUTH_MODE=everyapp`, `vite.config.ts` swaps the Cloudflare Vite plugin 1.x and `wrangler.jsonc` for plugin 2.x and `cloudflare.config.ts`: the app's Worker from `everyAppWorker()`, and the site-audit engine (`src/audit-worker.ts`) as its helper Worker from `everyAppAuxiliaryWorker()`. The client build reads the same `AUTH_MODE`, so it shows the Every App copy. Every other build still uses `wrangler.jsonc`.
- **Manifest** (`everyapp.config.ts`). Resources (D1 and KV, which classes the audit Worker defines), the helper Worker, the provider and capability requests with each one's need (the settings below), migrations, and the build and dev commands. `public` is empty: report sharing and OpenSEO's other unauthenticated routes are hosted-only, and the gateway's tool calls carry their own tokens.

## Settings

`everyapp.config.ts` declares what OpenSEO needs set, with a `why` for whoever sets it, and whether OpenSEO opens without it. The provider keys are the gateway's, set once for every app from your Every App checkout; `pnpm everyapp configure openseo` asks for each, or set one alone: `CRAWLER_ACCESS_SECRET` and `OPENROUTER_MODEL` are OpenSEO's own, on its Workers. The gateway's app list shows OpenSEO as needing setup, with the command, until the required ones are set, and `pnpm everyapp status` shows each setting's state.

| Setting                                                        | Held by | Need     | Used for                                                                                                 |
| -------------------------------------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                           | gateway | required | SAM, prompt suggestions and website research, through the gateway's AI proxy                             |
| `DATAFORSEO_API_KEY`                                           | gateway | required | Keyword, SERP, backlink, local business and AI answer data, including scheduled rank checks              |
| `CONTEXT_API_KEY`                                              | gateway | optional | Rendering JavaScript-heavy pages when a site audit asks for it                                           |
| `CRAWLER_ACCESS_SECRET`                                        | OpenSEO | optional | Encrypting the Shopify crawler-access signatures audits of protected stores send (32+ chars)             |
| `OPENROUTER_MODEL`                                             | OpenSEO | optional | The OpenRouter model SAM, prompt suggestions and website research run on (default `openai/gpt-5.6-luna`) |
| `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET` | gateway | optional | Search Console and GA4 reads for your sites, with the Google account a member connects in Every App      |

```bash
pnpm everyapp secret set OPENROUTER_API_KEY
pnpm everyapp secret set DATAFORSEO_API_KEY
pnpm everyapp secret set CONTEXT_API_KEY # optional
pnpm everyapp secret set CRAWLER_ACCESS_SECRET --app openseo # optional
pnpm everyapp secret set OPENROUTER_MODEL --app openseo      # optional
```

`--app openseo` sets a value on OpenSEO's Workers from any directory; from this directory the name alone is enough, since the manifest lists both under `secrets`. That is how openseo.everyapp.team takes them too, being deployed with `everyapp deploy`.

Without `CONTEXT_API_KEY`, audits run unrendered: the "Render JavaScript" option is off and says an admin sets it (`src/server/lib/audit/rendering-policy.ts`), and a rendered audit asked for through MCP is refused with the same sentence. Without `CRAWLER_ACCESS_SECRET`, the crawler-access form (Settings → Shopify, and the bot-protection advice on an audit) says an admin sets it instead of offering to save a signature; audits of unprotected sites are unaffected. Without `OPENROUTER_MODEL`, the AI features run on the default model in `src/server/lib/openrouter.ts`.

## Run it locally

The Every App SDK and CLI it builds with are the published packages `@every-app/sdk` and `everyapp`, pinned to one exact version in `package.json`, so a clone of this repository installs and builds on its own: no checkout of the Every App repository beside it. To put it on your Gateway, run `pnpm everyapp install https://github.com/every-app/open-seo` from your [Every App](https://github.com/every-app/every-app) checkout, then `pnpm everyapp configure openseo`: the install takes the latest release, whose `everyapp-release.tar.gz` the Release workflow attaches when `pnpm release:publish` publishes a version, and the same command updates it later. To deploy your own changes instead, run that checkout's CLI from this directory: `node ../every-app/packages/cli/bin/everyapp.js deploy` (the CLI installed here runs `dev`, `db migrate` and `release`; a deploy also updates the Gateway, which only a checkout can build).

```bash
pnpm install
pnpm dev:everyapp        # everyapp dev, with AUTH_MODE=everyapp
```

`everyapp dev` applies the migrations to a local database in `.cloudflare/state` (not the `.wrangler/state` of `pnpm dev`), then starts a gateway-lite on `http://openseo.localhost:8787` with a seeded owner, the real identity checks with the dev key (`everyapp-identity-dev`, accepted only under `EVERYAPP_DEV=1`, which `everyapp dev` sets), and `/mcp` served from OpenSEO's tool catalog (send any `Authorization: Bearer` value). Both Workers run, sharing the database, KV and R2. With no gateway locally, DataForSEO, Context and OpenRouter use your own keys: write `DATAFORSEO_API_KEY`, `OPENROUTER_API_KEY` and, for rendered audits, `CONTEXT_API_KEY` into `.dev.vars` yourself (`everyapp dev` writes nothing there; `.env.local` isn't read once `.dev.vars` exists). The ready block's `Dev vars` line names the required ones still missing.

`everyapp dev` sets no `EVERY_APP_ORG_ID`, so a local run accepts the dev user's organization; set it in `.dev.vars` to the dev user's organization id (`everyapp dev` prints it) to try the pinning.

## Deploy it

Onto an organization's own Gateway: `pnpm everyapp install https://github.com/every-app/open-seo` from an [Every App](https://github.com/every-app/every-app) checkout. It installs the latest release, whose `everyapp-release.tar.gz` this repository's Release workflow attaches when `pnpm release:publish` publishes a version, and the same command updates it later. To deploy uncommitted changes, run that checkout's CLI from this directory (`node ../every-app/packages/cli/bin/everyapp.js deploy`); the CLI installed here runs `dev`, `db migrate` and `release`, not `deploy`, since a deploy also updates the Gateway.

`everyapp install` and `everyapp deploy` always send `EVERY_APP_ORG_ID` (the installing organization), which is what pins the install to it. The deploy provisions the database and KV, builds both Workers, checks them against the gateway's app policy, applies migrations, and uploads the audit Worker before the app's. The gateway holds the provider keys for every app that uses them, and OpenSEO's own settings are the optional `CRAWLER_ACCESS_SECRET` and `OPENROUTER_MODEL` (the settings above).

## What isn't done

- **Metering through the gateway's wallet.** Calls are counted against the install's organization and capped per day; nothing is charged yet.
- **Membership checks inside a SAM socket's lifetime.** A removed member can keep chatting for up to 15 minutes. A membership lookup at the gateway per turn would close that window; it isn't built.
- **Long tools.** The gateway gives a tool call 30 seconds. Most OpenSEO tools return well within it; prompt exploration and some research can take longer.
