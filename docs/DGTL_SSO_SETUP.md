# DGTL single sign-on: auth hub → SEO (then CMS, HR, CRM)

## Current account-matching policy (2026-09-23)

This supersedes the manual-only linking rollout described below. At the
maintainer's request, verified Google/DGTL users can enter directly: Better Auth
may match an existing account only when both incoming and local emails are
verified. No provider is trusted to bypass verification; profile overwrite is
disabled. Central active status, SEO assignment, and project membership checks
remain required. New entitled users get isolated workspaces. An old unlinked
SEO session starts central authentication instead of showing a linking form.
Unverified local accounts still require ownership recovery; they are not merged.

## What is implemented in this repository

SEO remains a separate application with its own Better Auth session and
organization membership checks. In hosted mode, it can optionally treat the
central Supabase Auth project as an OpenID Connect provider. This does **not**
share cookies or credentials between applications. The browser completes an
authorization-code redirect; SEO creates its own session afterward.

The pilot was verified with the existing account on 2026-09-23: explicit
linking returned to Settings, signing out and signing in through DGTL worked,
and project `d0dce5f3-5e12-43da-87b5-1d233754e58f` remained accessible.
The central-login release enables automatic redirects and mandatory SSO.
Local sign-in/sign-up URLs become central authentication handoffs, not forms.
Production version: `7b41a39b-e56c-423c-b18e-7263cc274937`.
The follow-up recovery fix distinguishes unlinked legacy sessions
(`DGTL_LINK_REQUIRED`) from token renewal failures (`DGTL_REAUTH_REQUIRED`).
The root and app shell offer explicit account linking or reconnection without
relaxing central entitlements or project membership checks. Linking must be
completed by the affected account owner; email matching is not a migration.
Post-deployment browser test passed: sign out of SEO, open the central hub,
click Open SEO, and arrive at the same project dashboard without entering
credentials or using a separate SEO sign-in form. The central session was
already authenticated. Expired central sessions and other users were not tested.
The auth frontend consent route has been deployed; the user confirmed OAuth
client registration, secret rotation, and frontend production configuration.
The confirmed auth backend base URL is `https://api.dgtl.lk/v1`.
Worker version `a52c65d5-37a9-4ab8-ab78-fb897ec3110a` is deployed. Live smoke
checks passed for the homepage, sign-in page, session endpoint, and OAuth
initiation. Supabase accepted the authorization request and redirected to
`https://auth.dgtl.lk/oauth/consent` with an authorization ID and S256 PKCE.
The subsequent real-user linking and fresh-login test passed. No database
migration ran. Dashboard overview figures remain demonstration data.

The supplied credential was initially saved as a plain-text Worker variable.
The current version stores it as `secret_text`; rotate it again in Supabase
and update the existing Cloudflare Secret to invalidate copies retained in
older Worker versions or deployment logs. Never send the value in chat.

### DGTL production deployment notes

The Cloudflare domain mapping has been verified: `seo.dgtl.lk` maps to the
`ceo-dgtl` production Worker. Its D1/KV/service/workflow bindings match the
local Wrangler configuration. Do not run database migrations or redeploy the
audit Worker merely to roll out SSO.

For the central-login release, after linking existing accounts, build with:

```sh
AUTH_MODE=hosted VITE_DGTL_DEMO_AUTH=false VITE_DGTL_SSO_ENABLED=true VITE_DGTL_SSO_AUTO_REDIRECT=true VITE_SHOW_DEVTOOLS=false NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vite build
```

Deploy the generated `dist/server/wrangler.json`, keeping the existing live
variables with `--keep-vars`. Explicit config values still override existing
values, so compare them with production first, including Turnstile settings.
Keep the OAuth client secret as a Cloudflare `secret_text` binding, never a
plain-text variable or a build-time `VITE_` value. Old Worker versions can
retain earlier plain-text bindings; rotate any credential previously stored
that way and save its replacement directly as a Secret.

New verified central users with active `seo` access can now get an SEO account
and isolated default workspace through the existing provisioning hook, without
a second signup form. Existing SEO users must explicitly link their account.
SEO rechecks central access on protected hosted requests, organization API
requests, and MCP calls. Keep migration mode until existing users are linked;
then enable `DGTL_SSO_REQUIRED=true` to deny unlinked legacy users too.

While SSO is enabled, Better Auth's implicit linking by matching a verified
email is disabled for **all** SEO login providers. An existing SEO account must
explicitly link any new provider from its authenticated session. This is
intentional: an email match must not silently attach a DGTL identity. The
installed Better Auth 1.6.22 default Generic OAuth profile path also decodes
ID-token claims without signature verification; this integration instead reads
identity from Supabase's authenticated UserInfo endpoint.

## 1. Configure the central Supabase Auth project

These steps happen in the Supabase project used by `auth.dgtl.lk`; that project
is not part of this repository.

The local separate projects are `Auth DGTL/DGTL-Service` (Next.js frontend)
and `Auth DGTL/DGTL-Service-Backend` (NestJS API). The frontend now includes
`/oauth/consent`, validates relative login continuations, and preserves them
through password, Google, signup, and company SSO flows. The new route checks
the active user's SEO access, exact registered client, callback, and allowed
scopes before auto-approval. Demo cookies cannot authorize a real OAuth flow.
The existing backend `/v1/me` remains the entitlement source; no additional
backend endpoint is needed.

Add these server-only values to the auth frontend and deploy it first:

```dotenv
DGTL_OAUTH_SEO_CLIENT_ID=<registered-seo-client-id>
DGTL_OAUTH_SEO_CALLBACK_URLS=https://seo.dgtl.lk/api/auth/oauth2/callback/dgtl-sso
API_URL=https://<auth-backend-public-host>/v1
```

1. In Supabase, open **Authentication → OAuth Server** and enable the OAuth 2.1
   server. This Supabase feature is currently beta; pilot SEO before wider use.
2. In **Authentication → URL Configuration**, confirm the Site URL is
   `https://auth.dgtl.lk` and add the frontend's required redirect URLs.
3. Set the OAuth authorization path to `/oauth/consent`.
4. Deploy the implemented `/oauth/consent` route with the allowlist above.
   Leave dynamic/public OAuth client registration disabled unless separately
   needed. Never auto-approve an arbitrary OAuth client.
5. Configure an **asymmetric JWT signing key** (RS256 or ES256). Supabase OIDC
   ID-token generation with the `openid` scope does not work with HS256.
   Supabase OAuth access tokens can also access database APIs as the user;
   review Row Level Security with the OAuth `client_id` claim so an SEO client
   token cannot read unrelated central data.
6. In **Authentication → OAuth Apps**, create a **confidential** client named
   `DGTL SEO`. Register this exact production redirect URI:

   `https://seo.dgtl.lk/api/auth/oauth2/callback/dgtl-sso`

   For local testing, also register a local client or allowed redirect URI:

   `http://localhost:3001/api/auth/oauth2/callback/dgtl-sso`

   Copy the client ID and client secret securely. Never put the secret in a
   `VITE_` variable or commit it.

   Use `client_secret_basic` for token authentication. SEO explicitly sets
   Better Auth's `authentication: "basic"` for both code exchange and refresh.

The OIDC discovery URL is the Supabase **project** URL, typically:

`https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration`

It is not `https://auth.dgtl.lk/.well-known/openid-configuration` unless your
infrastructure explicitly proxies the OIDC issuer there.

## 2. Configure SEO

Set the following in the SEO hosted runtime. Keep the existing
`AUTH_MODE=hosted`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, database, and Google
integration settings. The SSO credentials are additional settings, not a
replacement for SEO's own session secret.

```dotenv
AUTH_MODE=hosted
BETTER_AUTH_URL=https://seo.dgtl.lk
DGTL_SSO_ENABLED=true
DGTL_SSO_REQUIRED=false
DGTL_SSO_DISCOVERY_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration
DGTL_SSO_CLIENT_ID=<seo-oauth-client-id>
DGTL_SSO_CLIENT_SECRET=<seo-oauth-client-secret>
DGTL_SSO_ACCESS_CHECK_URL=https://<auth-backend-public-host>/v1/me
```

Set these at **client build time** too (the first enables the link/sign-in UI;
the second should stay false during account migration):

```dotenv
AUTH_MODE=hosted
VITE_DGTL_SSO_ENABLED=true
VITE_DGTL_SSO_AUTO_REDIRECT=false
```

For local testing, use `BETTER_AUTH_URL=http://localhost:3001`, the local
callback URI above, local-only OAuth client credentials, and
`DGTL_SSO_ACCESS_CHECK_URL=http://localhost:4000/v1/me` when the Nest backend
is running there. Both the runtime
and browser build must be configured consistently. A missing server-side SSO
value when `DGTL_SSO_ENABLED=true` fails configuration rather than silently
falling back to an untrusted provider.

For a completely local test, use a separate Supabase test project with Site URL
`http://localhost:3000`, authorization path `/oauth/consent`, and the frontend
callback `http://localhost:3000/auth/callback`. The auth frontend runs on 3000,
the Nest backend on 4000, and SEO on 3001. All must use the same test project.
Use the test client ID and local SEO callback in the frontend's allowlist.
Do not change the production Site URL for a local test. Start SEO using
`NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vite --port 3001`.
Visit SEO directly in local tests: the production portal deliberately rejects
plain HTTP service-card destinations.

## 3. Link existing SEO accounts (one-time migration)

1. Sign in to SEO using the current method.
2. Open SEO **Settings → DGTL account → Link DGTL account**.
3. Sign in to the central DGTL account and complete the authorization flow.
4. Return to SEO and verify the same SEO user and organization are active.
5. Sign out of SEO, then use **Continue with DGTL** on the SEO sign-in page.

The central Supabase account must have a verified email. If its profile has no
display name, SEO uses the verified email as the display name.

Do not link accounts by matching email strings in a script. The OAuth account
link binds the verified provider subject to the existing SEO user. If a user
has multiple SEO organizations, keep the current server-side membership check
when choosing an organization/project.

## 4. Enable the one-click hub handoff

After the migration test passes, build SEO with
`VITE_DGTL_SSO_AUTO_REDIRECT=true` and set runtime `DGTL_SSO_REQUIRED=true`.
The hub's SEO card should link to `https://seo.dgtl.lk/user`, **not** include an access
token in its URL. If the SEO session is absent, SEO starts OIDC automatically.
Supabase sees the existing central session, completes authorization, and
returns the browser to SEO. If the central session has expired, the user sees
the central DGTL login, never a second SEO signup form.

Signing out of SEO only ends the SEO session. The sign-out path suppresses
immediate automatic SSO so it does not silently sign the user back in. Global
logout across products needs a separate, coordinated design.

## 5. Provisioning, revocation, and boundaries

New users must have a verified central email, active profile, and assigned
`seo` service before SEO provisions their local account and default workspace.
First-time clients still complete website onboarding and applicable billing
steps. Login alone does not configure Google, DataForSEO, or other SEO services.
Existing users are bound by provider subject, never silently merged by email.

Linked users' access is checked even when they use a local login. Removing SEO
access or suspending the central profile denies subsequent protected requests.
Refresh-token failures and central API outages fail closed. DGTL self-unlinking
is blocked so it cannot bypass the migration check. Unlinked users retain
legacy access only while `DGTL_SSO_REQUIRED=false`; enable strict mode after
migration. Access checks add a central network dependency and latency.

Already displayed data, accepted background jobs, and long-lived agent
connections are not remotely erased/stopped immediately. Coordinated global
logout and live connection termination are separate follow-up work.

The current auth database models `profiles` and `client_service_access` per
**user**, rather than an organization with multiple members. That is enough
for the initial one-user-per-client portal, but a company with several staff
needs a separate client-organization and membership model before adding those
staff or switching between clients. The SEO sign-in check currently requires
`/v1/me` to report the same Supabase user ID, `active` status, and assigned
`seo` service. New central users get individual workspaces; mapping several
employees to one company requires an explicit central membership model.

CMS, HR, and CRM are not integrated by this SEO change. Each needs its own
client ID, callback, service check, local session, and data permissions. Extend
the hub with explicit client-to-service allowlist mappings; do not share the
SEO client secret or approve arbitrary clients. Check the central service
catalog: a CMS card must not accidentally point to SEO.

## Acceptance checks

1. A linked user signs in once at `auth.dgtl.lk`, clicks SEO, and lands in the
   expected SEO project without another password or signup form.
2. The same user can open a protected SEO URL directly and return to that URL.
3. A new entitled user gets onboarding. A user lacking SEO access, a suspended
   user, or an unlinked existing user in strict mode cannot access SEO data.
4. A user with two clients can access only projects belonging to the selected
   client; changing a URL parameter does not switch authorization.
5. Expired central sessions, canceled consent, invalid callbacks, and SEO-local
   sign-out have understandable outcomes without redirect loops.
6. Remove SEO access while signed in: the next application, organization, and
   MCP request is denied. Restore access and verify recovery.
7. Verify expired-token refresh and fail-closed behavior on backend outages.
8. Confirm root and `/user` portal destinations reach SEO without asking for a
   second password. A first login can still require project/billing onboarding.

References: [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[Supabase OAuth flow](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows),
[Supabase token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[Better Auth 1.6 Generic OAuth](https://better-auth.com/docs/1.6/plugins/generic-oauth).
