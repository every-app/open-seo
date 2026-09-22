# DGTL SEO Tool — account handoff and remaining development

**Snapshot:** 22 September 2026, Asia/Colombo. This is a handoff for a new Codex account using either this local checkout or a fresh clone of the pushed `dev-seo` branch. It contains no credential values. Recheck external dashboards before changing production because their state can change after this snapshot.

## 1. Product goal and ownership

DGTL wants to provide `seo.dgtl.lk` as a multi-client SEO portal. DGTL staff act as platform super administrators. Each client company has an isolated workspace, users, websites, reports, and connections. Client users should see only their authorized websites. The desired product combines SEO research/audits, GA4 analytics, Search Console, problem reports, and Microsoft Clarity behavior insights. The visual reference was Semrush's SEO dashboard, but the DGTL design should be distinct.

The requested journey is: DGTL creates a client → invites the client's email → the client verifies the email or uses Google login → the server checks their organization membership and role → the client connects website properties → the dashboard and reports show tenant-scoped data. Platform administrators manage all clients separately at `/admin/clients`.

## 2. Repository and Git state — read this first

| Item | Snapshot |
| --- | --- |
| Local checkout | `/Users/sandaluthushan/Documents/ChatGPT/CEO Tool` |
| Repository | `https://github.com/Sandalu-DGTL/DGTL-SEO-Tool` |
| Branch | `dev-seo`, tracking `origin/dev-seo` |
| DGTL implementation commit | `ca7b662` (`feat: add DGTL SEO client portal foundation`, 2026-09-22), pushed to `origin/dev-seo` |
| Working tree | Clean at handoff after the implementation and report update were pushed. Check `git status --short` for the latest state. |

The new Codex account can use the existing local checkout or clone `origin/dev-seo`; the DGTL implementation is now on GitHub. `.env.local` and Cloudflare secrets are **not** in Git, so a fresh clone still needs private local configuration. Do not paste secret values into a chat.

The root `AGENTS.md` asks for simple TypeScript, Zod at trust boundaries, and new backend work organized as TanStack server function → service → repository. Keep SQLite/D1 and Postgres schema/query compatibility. Do not reorganize unrelated files just to make a folder tree look tidy.

## 3. Current architecture

| Layer | Current implementation |
| --- | --- |
| Web app | React 19, TypeScript, TanStack Start/Router/Query, Vite, Tailwind CSS 4, DaisyUI, Recharts |
| Runtime | Cloudflare Worker `ceo-dgtl`; separate audit Worker `ceo-dgtl-audit` |
| Database | Cloudflare D1 (`dgtl-seo`, SQLite), Drizzle ORM; optional Postgres/Hyperdrive path exists but is not active in this deployment |
| Other storage | KV and OAuth KV bindings; Durable Objects for agent chat; Workflows/Cron for site audit and rank tracking; **R2 binding is currently disabled** |
| Authentication | Better Auth in `AUTH_MODE=hosted`; Google social login provider is enabled only when both Google client variables exist |
| Tenant boundary | One Better Auth organization per client; website projects belong to an organization. Membership/role checks must be enforced server-side on every client request. |
| SEO data | DataForSEO server-side integration for keywords, SERPs, domain/backlink data, and tracking |
| AI | OpenRouter-backed SAM agent; model/cost controls and server-side key |

Key entry points: `wrangler.jsonc`, `wrangler.audit.jsonc`, `src/lib/auth.ts`, `src/server.ts`, `src/db/`, `src/server/features/`, `src/serverFunctions/`, and `src/routes/`. The existing architecture note is `docs/ARCHITECTURE_AND_FOLDERS.md`.

## 4. What has been built locally

| Area | Code and current behavior | Completion boundary |
| --- | --- | --- |
| DGTL landing and auth look | `src/client/features/landing/`, `src/routes/_auth.sign-in.tsx`, `src/routes/_auth.sign-up.tsx`, `src/client/features/auth/` | Branded pages exist. Recheck all text for leftover “OpenSEO” and test the whole signup/verification flow. |
| SEO overview | `src/client/features/dashboard/DgtlOverview.tsx` | Semrush-inspired charts/cards currently use **demonstration figures**; the UI itself says so. Replace with authorized, source-labelled data. |
| Super-admin dashboard | `/admin/clients`, `src/client/features/super-admin/`, `src/server/features/super-admin/`, `src/serverFunctions/superAdmin.ts` | Read-only counts and client list/search exist. No complete create/edit/suspend/invite workflow yet. Server function checks the platform admin allowlist. |
| Clarity module | `/p/:projectId/clarity`, `src/routes/_project/p/$projectId/clarity.tsx` | Setup/feature placeholder only. No Clarity token, per-project mapping, export ingestion, or real visual heatmap. |
| Existing OpenSEO functions | Keyword/domain/backlink research, GSC, GA4, ranking, site audit, saved/report pages, AI agent | Much code predates DGTL customization. Verify each feature with a tenant-scoped live connection before advertising it as complete. |
| Folder guidance | `docs/ARCHITECTURE_AND_FOLDERS.md` | Proposed feature-slice pattern; not a wholesale repository migration. |

The super-admin policy is in `src/server/features/super-admin/policy.ts`. In hosted mode, an email is a platform admin **only if listed in `SUPER_ADMIN_EMAILS`**. That variable was absent in both local `.env.local` and the production Worker at inspection time, so the new admin screen will deny real hosted users until configured. Client organization roles do not grant global access.

## 5. Local and production configuration snapshot

Local `.env.local` uses `PORT=3001`, `AUTH_MODE=hosted`, `DATABASE_PROVIDER=d1`, `BETTER_AUTH_URL=http://localhost:3001`, and `VITE_DGTL_DEMO_AUTH=false`. Port 3001 was **not listening** at handoff. The global `pnpm` on this machine is older than the repository's pinned `pnpm@10.30.1`; use `corepack pnpm` or activate Corepack.

| Capability | Local `.env.local` name present | `ceo-dgtl` Worker name present | What that proves |
| --- | --- | --- | --- |
| Better Auth | `BETTER_AUTH_API_KEY`, `BETTER_AUTH_SECRET`, URL/mode | Same | Variables exist; dashboard synchronization was not retested in this report. |
| DataForSEO | `DATAFORSEO_API_KEY` | Same | Credential exists; a successful API data request and remaining balance were not retested. |
| OpenRouter | `OPENROUTER_API_KEY` | Same | Credential exists; a model response/spend check was not retested. |
| Turnstile | Site and secret keys | Site and secret keys | Both names exist; confirm the production widget and server validation with a controlled signup test. |
| Google OAuth | **Missing** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally | Both names present | The user reports production Google login working. Local Google login still needs its own localhost client/credentials. |
| Loops email | Missing | Missing | Email verification, password reset, and invitation delivery need setup. |
| Super-admin allowlist | Missing | Missing | Hosted super-admin access is blocked. |
| PostHog | Missing | Missing | Optional product analytics. |
| Autumn | Missing | Missing | Optional until subscriptions or usage billing launch. |
| R2 | No binding | No binding | Large report/cache storage is not available. |

Cloudflare secrets are encrypted in the dashboard; name presence does not reveal or validate the underlying value. Avoid reprinting any key. The production Worker settings are at `https://dash.cloudflare.com/1880492361d52960e0f3c74514809975/workers/services/view/ceo-dgtl/production/settings#variables`. The production domain is `https://seo.dgtl.lk`, mapped to Worker `ceo-dgtl` in the Sandalu Cloudflare account. The user reported it and Google login working; a fresh end-to-end login was not independently completed in this handoff.

**Google Cloud warning:** Project `original-aspect-509316-a5` has two OAuth Web clients with the same name, “DGTL SEO Tools – Production,” created during setup. Identify the client ID actually stored in Cloudflare before retiring the duplicate. As last inspected, the Google Auth Platform Audience page was **External / Testing**, with **0 test users** and a disabled Publish button pending Branding completion. This can prevent other client accounts from using Google login even if Sandalu can use the site. Do not expose client secrets in the handoff or delete a client until the active one is known.

**Credential hygiene:** Some credential material was pasted in the earlier conversation. Rotate any exposed DataForSEO/OpenRouter credentials and any Google client secret if the old transcript is shared. Do not copy secret values into the new Codex account; use the provider dashboard and Worker secrets.

## 6. Important integration distinctions

- **Google login is not GA4 or Search Console access.** GA4 asks for `analytics.readonly`; GSC asks for `webmasters.readonly`. A client must grant the right scope and have permission on the correct GA4 property/GSC site. The connection must be saved to the authorized website project.
- **Clarity has no live connector.** The existing screen is a product placeholder. Microsoft's Data Export API returns recent project insight summaries. Native Clarity heatmaps/session replay should link to Clarity unless a supported export exists; do not fabricate heatmap data or claim the export API provides raw click coordinates.
- **Loops is the next practical auth dependency.** `src/server/email/loops.ts` expects `LOOPS_API_KEY`, verification and reset transactional IDs; client invitations also need `LOOPS_TRANSACTIONAL_INVITATION_ID`. Verify the sending domain and published templates, then test real mail delivery.
- **R2 is not active despite some older documentation describing it as used.** `wrangler.jsonc` explicitly leaves it commented out. Avoid enabling report features that require it until a bucket and `R2` binding exist.
- **Production D1 is the current database.** `docs/DGTL_BACKEND_HOSTING_GUIDE.md` recommends Postgres/Hyperdrive as a future scale path, but that is not the deployed configuration.
- **Some docs are stale.** `docs/DGTL_SEO_PLATFORM.md` and `docs/LOCAL_DEVELOPMENT.md` mention `local_noauth`, while the current `.env.local` is `hosted`; trust runtime config and update docs after agreeing on the intended developer workflow.

## 7. Remaining development, recommended order

1. **Validate the pushed baseline.** Check `git status`, branch/upstream, build, and key flows. Keep subsequent changes on `dev-seo` or a review branch. Review staged files for secrets before every future push.
2. **Finish admin access and client lifecycle.** Set `SUPER_ADMIN_EMAILS` for DGTL staff; test server-side deny/allow. Add audited create-client, create-first-project, invite, client-detail, suspend/reactivate, and staff-assignment flows. Keep cross-client queries tenant-safe and test isolation with two organizations.
3. **Finish email.** Verify a DGTL sender domain in Loops; create and publish verification, reset, and invitation templates with exactly the variables the code sends; add secrets locally and to Cloudflare; test delivery and expiry/error paths. Do not use local email-verification bypass in production.
4. **Prepare Google OAuth for external clients.** Complete Branding and publishing in Google Cloud, confirm domain ownership/privacy URLs, settle duplicate clients, and create a separate local OAuth client for `http://localhost:3001/api/auth/callback/google`. Keep Google login scopes minimal; request GA4/GSC read-only scopes only when connecting those features.
5. **Make the dashboard real.** Define normalized, tenant-scoped overview metrics with source, date window, refresh time, and empty/error states. Replace demonstration values from DataForSEO, GSC, GA4, site audit, and Clarity only after the corresponding connection exists. Build actionable problem reports, not unsupported blended numbers.
6. **Connect each client's GA4 and GSC.** Enable the APIs in Google Cloud, verify OAuth scopes/consent, connect each authorized property from the project's settings, persist tokens server-side, and test revocation/refresh and per-client isolation.
7. **Implement Clarity accurately.** Decide whether DGTL or each client owns the Clarity project; store project IDs and tokens per tenant on the server; ingest supported summary metrics; show a clear link to native Clarity heatmaps and recordings. Add a connector-health/error display.
8. **Enable R2 only for features needing it.** Create the bucket and binding, then verify audit/report artifact retention and access control. Add PostHog and Autumn only when product analytics and billing are part of the launch scope.
9. **Release readiness.** Test local and production sign-in, invitation, tenant isolation, key SEO pages, provider failures, migrations, backups, usage limits, observability, and domain/DNS/HTTPS. Update docs to match the deployed D1 configuration.

## 8. Commands and checks for the next account

From the existing checkout:

```sh
git status --short
git branch -vv
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm run db:migrate:local
corepack pnpm run dev
```

The type check **passed** with `corepack pnpm exec tsc --noEmit` on 22 September 2026. `corepack pnpm run build` also exited successfully after producing client, server, and audit Worker bundles and running TypeScript. Wrangler printed a non-fatal log-file `EPERM` message because this Codex sandbox cannot write under the user's Library/Preferences directory; that is an environment limitation, not an application error. The global `pnpm exec tsc --noEmit` failed before type checking with `packages field missing or empty`; this pnpm-version papercut is already recorded in `.agents/PAPERCUTS.md`. Automated tests and live provider calls were **not** run for this report. Port 3001 was not running at handoff.

Do not run `pnpm run deploy` simply to test the report. It runs production D1 migrations, builds, and deploys the audit and application Workers. Review the exact changes and environment first.

## 9. Existing research and documentation

- `reports/dgtl-platform/01-semrush-vs-openseo.html` — Semrush/OpenSEO feature comparison.
- `reports/dgtl-platform/02-clarity-heatmaps.html` — Clarity heatmap research.
- `reports/dgtl-platform/03-ga4-integration.html` — GA4 connection research.
- `reports/dgtl-platform/04-dgtl-architecture.html` — proposed platform and user flow.
- `reports/dgtl-platform/05-current-backend-inventory-2026-09-19.html` — earlier backend inventory.
- `reports/dgtl-platform/06-multi-client-service-plan-2026-09-19.html` — earlier multi-client plan.
- `docs/ARCHITECTURE_AND_FOLDERS.md`, `docs/BETTER_AUTH_DASHBOARD.md`, `docs/DGTL_BACKEND_HOSTING_GUIDE.md`, and current source files are the implementation references. Older reports are research, not proof that a feature is deployed.

## 10. Paste this into the new Codex account

> Continue the DGTL SEO Tool project on branch `dev-seo` in `https://github.com/Sandalu-DGTL/DGTL-SEO-Tool` (or the existing checkout at `/Users/sandaluthushan/Documents/ChatGPT/CEO Tool`). Read `AGENTS.md` and `reports/DGTL_SEO_ACCOUNT_HANDOFF_2026-09-22.md` first. The DGTL implementation was pushed as commit `ca7b662`; private `.env.local` and Cloudflare secrets are not in Git. The product is a multi-client SEO portal at `seo.dgtl.lk` with Better Auth, D1, DataForSEO, GA4/GSC, a super-admin area, and a planned Clarity module. Do not treat the dummy overview or Clarity placeholder as live data. Never print or commit secrets. First validate the pushed baseline, then help finish `SUPER_ADMIN_EMAILS`, Loops transactional email, Google OAuth publishing for external clients, and the client lifecycle. Keep each client isolated by organization/project and use the server function → service → repository pattern. Ask me for any provider access or business choice you cannot infer.
