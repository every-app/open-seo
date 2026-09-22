# DGTL SEO platform

## Current local runtime

Run the app at `http://127.0.0.1:3001`. Local development uses Vite with the
TanStack Start development server. `.env.local` uses `AUTH_MODE=local_noauth`,
which injects one local admin identity and is suitable only for a private local
machine. The local D1 migrations must be applied before the first run:

```sh
pnpm run db:migrate:local
pnpm run dev
```

If the global pnpm version rejects the workspace file, activate the version in
`package.json` with Corepack first.

## Technology stack

- React 19 and TypeScript for the interface.
- TanStack Start and TanStack Router for SSR, file-based routes, and server functions.
- Vite for local development and builds.
- Tailwind CSS 4 and DaisyUI for styling.
- Cloudflare Workers for the application runtime and a separate audit worker.
- Drizzle ORM for typed database access and migrations.
- Better Auth for hosted email/password authentication, organizations, and OAuth.
- Google OAuth for optional Search Console and GA4 read-only connections.
- DataForSEO for keyword, SERP, domain, backlink, and rank data.

## Data storage

Cloudflare D1 (SQLite) is the default database. It stores users, organizations,
projects, integration bindings, reports, audit metadata, and application state.
Cloudflare KV stores short-lived caches, OAuth state, and audit progress. R2
stores larger cached payloads and audit artifacts. PostgreSQL through Hyperdrive
is an optional scale path; it is not the local default.

## Clarity module

The project now has a **Clarity** navigation module at
`/p/:projectId/clarity`. It provides the product surface for click heatmaps,
rage clicks, scroll depth, and attention summaries, plus the setup boundary.
Live data is not claimed until a server-side Clarity project ID and Data Export
API token are added. The documented export API provides recent insight
summaries; native Clarity heatmap images and session replays should remain in
Clarity unless Microsoft exposes a supported export for them.
