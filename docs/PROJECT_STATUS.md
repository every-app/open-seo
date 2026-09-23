# DGTL SEO project status — 2026-09-23

## Source and deployment

- Repository: Sandalu-DGTL/DGTL-SEO-Tool.
- Local branch: `dev-seo`.
- Current commit: `e4fb557` (`done all code`). Local upstream comparison is 0 ahead/0 behind; this is not a fresh remote fetch.
- Recent SSO work and this cleanup remain uncommitted. A production deployment is not a Git commit.
- Last deployment recorded in this task: Cloudflare Worker `ceo-dgtl`, version `1a0368c2-2f6e-48f8-91e9-cb7333e39175`, serving `seo.dgtl.lk`.
- This cleanup has not been deployed. No database migrations or production permission changes were made in this cleanup.

## Architecture

React 19 + TypeScript + TanStack Start/Router/Query, Vite, Better Auth,
Drizzle, Cloudflare Workers and D1. The repository also supports PostgreSQL.
DGTL's separate portal uses Supabase authentication; SEO consumes its OAuth
identity and checks service entitlement through the central backend.

```text
src/
  routes/                  Route composition and API entry points
  client/
    features/              Feature UI, hooks, and auth recovery components
    components/            Reusable UI
    layout/                App shell and navigation
    lib/                   Browser-specific helpers
  serverFunctions/         TanStack server function entry points
  middleware/              Authentication/request context
  server/
    auth/                  Central access checks and auth repository
    features/<feature>/
      services/            Business operations
      repositories/        Database access
    lib/                   Server errors and supporting utilities
  db/                      SQLite and PostgreSQL schemas
  shared/                  Shared validation, constants, error codes
  lib/                     Auth configuration and cross-runtime helpers
```

Prefer server function → service → repository for new backend work. Keep
routes thin and avoid moving established files just to rename folders.
Do not import server secrets or database clients into browser code.

## Cleanup completed

- Removed duplicate automatic SSO effect from the sign-in page; the auth layout owns that redirect.
- Disabled email/password authentication in mandatory DGTL SSO mode at the backend configuration layer, not just the UI.
- Validated the unlink-account request body using Zod before reading its provider ID.
- Standardized formatting in the recent authentication components.
- Added a regression test for mandatory-SSO password-auth restrictions.
- Kept explicit verified-email matching: incoming and existing local emails must both be verified. No trusted-provider bypass was added.

## Verification

- Full Vitest suite: 170 files, 1,403 passing tests.
- Repository type-aware lint: zero warnings, zero errors across 943 files.
- TypeScript and whitespace checks are run separately before handoff.
- Prior production browser check confirmed the original linked account's project remains accessible.
- These tests do not establish that every Google account, every integration, or every cross-client security boundary has been tested live.

## Remaining work and risks

1. Commit and review the accumulated SSO changes before another release.
2. Rotate the OAuth secret if the previously disclosed value has not been replaced again; old deployment versions/logs may retain prior plaintext values.
3. Test fresh users, expired/revoked sessions, suspended clients, and cross-project isolation end to end with controlled accounts.
4. Review dependency advisories and perform a separate security audit; passing tests is not a security certification.
5. Measure API latency, query counts, bundle size, and Core Web Vitals before claiming performance improvements. Do not cache permission checks without a documented revocation window.
6. Dashboard overview metrics remain demo data. Google Analytics was not connected in the inspected project.
7. The portal CMS card was observed pointing to SEO; fix it in the separate portal configuration once the correct CMS destination is confirmed.
8. The generic `deploy` script includes production database migrations and an audit-worker path from another deployment configuration. Use the documented, reviewed DGTL deployment procedure rather than running it blindly.

Supported self-hosted authentication, Google data connectors, migrations,
and tests were retained. No broad dead-code deletion or repository-wide
performance optimization was attempted without usage evidence.
