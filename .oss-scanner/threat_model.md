# OpenSEO threat model

## What OpenSEO is

OpenSEO is an open-source SEO platform: keyword, SERP and backlink research, site audits, rank tracking, and Google Search Console (GSC) and Google Analytics (GA4) reporting. Users save HTML reports, chat with an in-app agent called SAM, and connect AI clients through an MCP server. It is a TanStack Start app on Cloudflare Workers with D1 (SQLite) or Postgres.

`AUTH_MODE` (`src/lib/auth-mode.ts`) sets how OpenSEO runs:

| Mode                | Where it runs                                     | Login                     | Billing                                  |
| ------------------- | ------------------------------------------------- | ------------------------- | ---------------------------------------- |
| `hosted`            | app.openseo.so, multi-tenant                      | Better Auth, free sign-up | Autumn credits                           |
| `local_noauth`      | Docker default (`deploy/docker/`, `compose.yaml`) | none                      | none (operator pays DataForSEO directly) |
| `cloudflare_access` | operator's Cloudflare account (`deploy/alchemy/`) | Cloudflare Access         | none (operator pays DataForSEO directly) |

Where the code lives:

| Part                                            | Path                                        |
| ----------------------------------------------- | ------------------------------------------- |
| App worker entry                                | `src/server.ts`                             |
| Site-audit worker                               | `src/audit-worker.ts`                       |
| Server functions                                | `src/serverFunctions/`                      |
| Services and repositories                       | `src/server/features/`                      |
| MCP                                             | `src/server/mcp/`                           |
| Billing                                         | `src/server/billing/`                       |
| Schemas                                         | `src/db/` (SQLite), `src/db/pg/` (Postgres) |
| Marketing site and free tools (separate worker) | `web/`                                      |

## Who is trusted

The main boundary is between organizations. A user in organization A must never read or change anything that belongs to organization B:

- its projects, and everything stored under a project (audits, keywords, rank trackers, AI-visibility runs, reports, SAM sessions, GSC and GA4 connections)
- its members, invitations and billing

The organization id comes from the signed-in session, never from the client.

- Anyone without an account: not trusted. They can reach:
  - `/api/auth/*` and the OAuth endpoints (hosted only)
  - `/mcp`, which depends on the mode:
    - `hosted`: 401 without an OAuth token or `oseo_` key
    - `cloudflare_access`: needs the Access JWT
    - `local_noauth`: open
  - share links `/s/<token>`, `/s/<token>/raw`, `/s/<token>/og.png` (hosted only)
  - `/api/health`, `/api/privacy-region`, `/.well-known/openai-apps-challenge`, the Autumn webhook, GDPR erasure, and `web/src/routes/api/`
- A signed-in hosted user: trusted only in organizations they belong to. Sign-up is free, so this is a low bar.
  - Roles (`src/lib/org-permissions.ts`): owner (billing), admin (projects, integrations, invitations), member. Handlers check them with `requireOrgPermission` (`src/server/auth/org-gate.ts`).
- Other members of the same organization: must not use a user's MCP API keys, MCP OAuth authorizations or SAM sessions.
- Google connections: the OAuth grant (stored tokens, property list, disconnect) belongs to the user who authorized it. The project connection built on it is shared with every organization member by design, and queries run under the connecting member's grant (`docs/maintainers/specs/0003-google-search-console-integration.md`). Another member must not read or export the stored tokens, or connect or re-point a project using a Google account they did not authorize.
- MCP clients: OAuth tokens (24-hour access, 30-day refresh) and `oseo_` API keys act as the user who created them. They carry no role of their own.
- Self-host operator: fully trusted.
- DataForSEO, Google, Autumn, OpenRouter and Context (the external page fetcher): treat their responses as untrusted input, but do not treat the services themselves as attackers.
- Crawled websites, SERP results and AI answers: untrusted, and may carry prompt injection.

## What to look at first

1. Tenant isolation. Can a user reach another organization's data?
   Look for a request id (report, audit, session, grant) that reaches a query without the verified organization or user id.
   - Server functions: `src/start.ts` adds `ensureUserMiddleware` (`src/middleware/ensureUser.ts`) to all of them. It loads the project by project id and organization id before the handler runs. The user comes from `src/middleware/ensure-user/resolve.ts`.
   - Routes that check access themselves: `src/routes/r/`, `src/routes/s/`, `src/routes/api/`, plus `/api/ai-visibility/download` and `/agents/*` in `src/server.ts`.
2. MCP server and OAuth provider. Can a token or API key reach a project its user can't, or be issued without the user's consent?
   - `src/server/mcp/oauth-provider.ts`: open client registration; consent at `POST /api/oauth/consent`
   - `src/server/mcp/api-key-auth.ts`
   - `src/server/mcp/transport.ts`: checks membership on every request
   - `src/server/mcp/project-auth.ts`: `withMcpProjectAuth`, used by every project tool
3. Billing (hosted). Can someone spend DataForSEO or OpenRouter money they did not pay for?
   Look for a provider call on none of the metered paths below, or a path entered without its credit check.
   - `createDataforseoClient` (`src/server/lib/dataforseo/client.ts`) reserves credits, makes the call, then charges the actual cost. AI-visibility LLM answers use this path too.
   - Admitted research: research jobs that check once for a positive balance, make raw provider calls, then charge through `billResearchSpend` (`src/server/billing/researchSpend.ts`). The balance may go negative once. Entry points: `src/server/features/projects/services/websiteResearch.ts` (called from `ProjectWebsiteService.ts`) and the AI-visibility research services.
   - SAM chat (`src/server/features/sam/SamChatAgent.ts`): each turn first checks that the organization has credits (`checkUsageCreditsDepleted`). The OpenRouter cost is charged after the fact, in chunks, through `trackUsageCreditSpend`. Look for spend before the check, or an error or shutdown path that skips the charge.

   Other billing code:
   - Checkout accepts only fixed plan ids (`src/server/billing/checkout.ts`).
   - The legacy `src/routes/api/autumn/$.ts` answers only `getOrCreateCustomer`, for the caller's own organization.

   Design notes: `docs/maintainers/specs/0002-hosted-dataforseo-metering-with-autumn.md`.

4. Sign-up and invitations (hosted). Can someone farm free credits or send bulk email through us?
   Controls:
   - Turnstile and a disposable-email check (`src/lib/auth.ts`, `src/server/auth/disposable-email.ts`)
   - Invitation caps: 5 emails per address and 50 per organization per day (`src/server/auth/invitation-send-limit.ts`)

   Bypassing a control is in scope. A domain missing from the blocklist is not.

5. SSRF. Can a user make the server fetch a private address?
   `src/server/lib/audit/url-policy.ts`: `normalizeAndValidateStartUrl` for start URLs (with a DNS-over-HTTPS lookup) and `isCrawlableUrl` for links found mid-crawl (no DNS, by design). Callers include the crawler, `src/server/lib/scrape.ts` (SAM's `read_pages`) and `src/server/features/indexnow/`. On Cloudflare, `global_fetch_strictly_public` in `wrangler.jsonc` and `wrangler.audit.jsonc` also blocks private addresses. We have not confirmed that this setting works in Docker, where workerd (Cloudflare's local Workers runtime) runs the app. In Docker, treat `url-policy.ts` as the only control.
6. Report HTML. Can script in a report run outside its sandbox?
   Reports are model-written HTML stored without sanitizing (`src/server/features/reports/`). The CSP sandbox in `src/shared/report-sandbox.ts` is applied at `/r/<id>` (members) and `/s/<token>/raw` (public, hosted only).
7. Google OAuth. Can someone use a Google account they did not authorize, or read its tokens?
   `src/server/features/google/`, callbacks in `src/routes/api/gsc/` and `src/routes/api/ga4/`. The OAuth `state` value is single-use and tied to the signed-in user. Tokens are encrypted with `BETTER_AUTH_SECRET`.
8. Signed endpoints. Can a request without the secret get through?
   Two endpoints accept only signed requests: the Autumn webhook (`src/server/billing/autumn-webhook.ts`, `svix.ts`) and GDPR erasure (`src/server/gdpr/`). GDPR erasure returns 404 when its secret is unset.
9. Prompt injection. Can a crawled page make SAM act against its user?
   SAM (`src/server/features/sam/`) reads third-party pages. It can call tools that change the project or spend credits. It can also save notes to project memory, and those notes come back in later chats.
10. Free tools. Can someone get around the spend caps?
    The free tools (`web/src/routes/api/`, `web/src/lib/free-tools/`) need no account and spend the site's DataForSEO key. Three caps limit them: Turnstile, a per-IP rate limit, and a daily budget kept in a Durable Object. `event.ts` (analytics proxy to plausible.io) and `subscribe.ts` (adds any email to the Loops newsletter) are not free tools and have none of these controls. This is known, and abuse of either is Low.

## What to leave alone

### Code that matters least

- Markdown and manifests: `web/content/`, `docs/`, `plugins/`, `.agents/`, `.claude/`.
- `scripts/`, `tests/` (including `tests/badseo/`, a deliberately broken SEO site), and `*.test.ts` files.
- `deploy/` and `.github/`, unless a workflow is exploitable from a fork pull request.
- `src/client/`. Route guards there only decide what to render. The exception is rendering untrusted links and markdown (`src/shared/safe-url.ts`, `src/client/components/Markdown.tsx`).
- Generated files: `src/routeTree.gen.ts`, `src/worker-configuration.d.ts`, Drizzle snapshots.
- `.npmrc`, build settings, and test-only switches such as `VITE_E2E_*`.

### Intended behavior: do not report

**Self-hosting**

- `local_noauth` has no login, so `/mcp` is open. It is meant to run behind the operator's own auth (`docs/SELF_HOSTING_DOCKER.md`, `docs/SELF_HOSTING_DOCKER_LEGACY.md`).
- Every `cloudflare_access` user is owner of the one shared workspace.
- Paid-plan checks, credit checks and report sharing are hosted-only.
- The self-host telemetry heartbeat (`src/server/lib/self-host-telemetry.ts`) and preflight beacon (`scripts/selfhost-preflight.ts`). They send aggregate counts, a random install id, version, deploy target, database backend, install age, and the names of failed setup checks. They never send URLs, keywords or emails. Documented in `docs/SELF_HOSTING_DOCKER.md`; off with `OPENSEO_TELEMETRY_DISABLED` or `DO_NOT_TRACK`.
- Self-host `/api/health` lists which features are configured (never the values).
- Anything needing the operator's Cloudflare account, environment, database or GDPR secret.

**Known limits**

- Open client registration on the MCP OAuth provider. A token still needs a signed-in user's consent.
- Every member of an organization can reach every project in it. Per-project access is not built yet.
- A signed-out or revoked session can stay valid on its cookie cache for up to 5 minutes. Organization membership is still checked on every request.
- A revoked share link can stay reachable for up to 60 seconds through the edge cache.

**Billing and spend**

- Heavy load caused by a signed-in user spending their own credits.
- Missing rate limits where credits or the free-tool budget already cap the spend.
- Two known billing gaps (spec 0002): a credit estimate that comes in slightly low, and admitted research taking the balance negative once. Report the overdraft only if it can repeat without limit.
- The `dub_id` referral cookie (`src/server/referrals/dub.ts`) only reports attribution to Dub. It grants nothing in the app.

**Public by design**

- Arbitrary markup in report HTML, while the sandbox holds.
- IndexNow keys. The protocol makes them public: the site key in `web/public/` and per-project keys stored in plain text.
- Context and Cloudflare Browser Rendering follow redirects on their own networks.

## How to exercise it

`.oss-scanner/Dockerfile` (`node:22`, pnpm 10.30.1, checkout at `/src`) installs both workspaces, builds the app into `dist/` and the website into `web/dist/`, and runs both test suites. No secrets are needed.

Offline, from `/src`:

```sh
pnpm run test:ci                     # root Vitest suite on Node; tests mock cloudflare:workers
pnpm vitest run <path>               # one file
pnpm --dir web run test:protection   # free-tool budget tests plus a workerd budget check
pnpm run types:check
```

Run the app offline in hosted mode:

```sh
AUTH_MODE=hosted BETTER_AUTH_URL=http://localhost:3001 BETTER_AUTH_SECRET=any-32-or-more-characters-will-do \
GOOGLE_CLIENT_ID=placeholder GOOGLE_CLIENT_SECRET=placeholder BYPASS_EMAIL_VERIFICATION=true \
CLOUDFLARE_INCLUDE_PROCESS_ENV=true OPENSEO_TELEMETRY_DISABLED=1 VITE_SHOW_DEVTOOLS=false \
  bash -c 'pnpm run db:migrate:local && pnpm exec vite preview --port 3001 --host localhost'
```

This serves the built app in workerd with local D1, KV, R2, Durable Objects and Workflows. It is ready when `GET /api/health` returns 200. Keep the host as `localhost`: Better Auth rejects a plain-http base URL on any other host.

Email-and-password sign-up works with no email, Turnstile or Google. Each sign-up creates its own organization, so two cookie jars are two tenants:

```sh
curl -s -c alice.jar -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"name":"Alice","email":"alice@example.com","password":"correct-horse-battery-staple"}' \
  http://localhost:3001/api/auth/sign-up/email
# An API key for /mcp (send it as Bearer or x-api-key):
curl -s -b alice.jar -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"name":"scanner"}' http://localhost:3001/api/auth/api-key/create
```

- Drive the server over HTTP. The client bundle in `dist/` was built without `AUTH_MODE=hosted`, so the pages do not show the hosted login.
- `AUTH_MODE=local_noauth` (drop the five auth variables) is the single-user mode: one user, one organization, no login. A Vitest test with two organizations also counts as a working reproduction, if it goes through a server function, route or MCP tool rather than a repository function directly.
- Offline, all provider calls fail, as does the DNS-over-HTTPS lookup in `url-policy.ts`. Log lines about `Request.cf`, `workers.cloudflare.com`, `posthog.com` or Loops are expected.
- Playwright tests (no browsers) and Postgres migrations (no server) do not run.

## How we rate severity

A report without a working reproduction is capped at Medium. A dependency CVE needs a reachable OpenSEO code path. Unless noted, assume the attacker has at most a free hosted account.

**Critical:**

- read or change data across many organizations
- take over another account
- obtain server secrets (`BETTER_AUTH_SECRET`, `CRAWLER_ACCESS_SECRET`, provider keys)
- obtain another user's Google tokens, API keys or OAuth tokens
- forge an Autumn webhook or GDPR erasure signature
- run code on the server

**High:**

- a user in organization A reads or changes a specific resource in organization B, by any path (including MCP and SAM)
- an MCP token or API key that still works after its user leaves the organization, or outside the `mcp` scope
- DataForSEO or OpenRouter spend nobody paid for, such as:
  - a provider call on no metered path
  - a skipped credit check
  - a way around the free-tool budget
  - farming free credits past the sign-up controls
- stored XSS that runs on app.openseo.so in another user's session
- script that escapes the report sandbox
- reading a shared report without its token

**Medium:**

- role escalation inside one organization (admin to owner, member to an admin action)
- prompt injection that makes SAM spend the user's credits or write to their project without being asked
- an open redirect without demonstrated token theft
- disclosure of whether an account exists

**Low:**

- missing security headers
- abuse of `event.ts` or `subscribe.ts`
- hardening against an attack another control already blocks

SSRF severity depends on who can trigger it:

| SSRF attacker                          | Reaches                            | Rating   |
| -------------------------------------- | ---------------------------------- | -------- |
| No account                             | responses from internal services   | Critical |
| Signed-in hosted user                  | private networks or cloud metadata | High     |
| User who can start audits, Docker only | the operator's network             | Medium   |

## How reports and patches should look

- One issue per report.
- Name the attacker's role, the `AUTH_MODE`, and whether the attacker belongs to the victim's organization.
- Give exact requests or a Vitest test (see "How to exercise it"), and what was obtained.
- Keep patches minimal. Fix the check where it is enforced (`ensureUserMiddleware`, `withMcpProjectAuth`, or the service or repository query), not in a single caller.
- Patches must work on SQLite and Postgres. A schema change updates `src/db/` and `src/db/pg/`, with migrations in `drizzle/sqlite/` and `drizzle/pg/`.
- Add a regression test when feasible, and say whether sibling routes or tools share the gap.
