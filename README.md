# SEOShark

White-label SEO platform: keyword research, rank tracking, competitor
insights, backlinks, site audits, AI visibility, and an MCP server so AI agents
(Claude Code, Codex, Cursor and friends) can run SEO workflows against the same
data.

This repository is the product: application, MCP server, agent skills,
marketing and docs site, and deployment configuration.

## Start here

1. [`docs/SETUP.md`](./docs/SETUP.md): brand the product, create the Supabase
   database, configure the third-party services, deploy to Cloudflare.
2. [`docs/DATABASE_SUPABASE.md`](./docs/DATABASE_SUPABASE.md): connection
   strings, migrations, Hyperdrive vs direct.
3. [`docs/LOCAL_DEVELOPMENT.md`](./docs/LOCAL_DEVELOPMENT.md): day-to-day
   development.

Branding lives in one file, [`src/shared/brand.ts`](./src/shared/brand.ts).

## Stack

- TanStack Start (React 19, TanStack Router/Query/Form), Tailwind + daisyUI
- Cloudflare Workers runtime: Durable Objects, Workflows, KV, R2, cron
- Postgres on Supabase (SQLite/D1 for local dev and the Docker image)
- Better Auth (email/password, Google, organizations, API keys, MCP OAuth)
- DataForSEO for SEO data; OpenRouter for the in-app agent
- Drizzle ORM with parallel SQLite and Postgres schemas

Hosting on Vercel is not supported by the current server code; the assessment
and port plan are in
[`maintainer-docs/PLATFORM_VERCEL_SUPABASE.md`](./maintainer-docs/PLATFORM_VERCEL_SUPABASE.md).

## Deployment paths

| Path                          | Command                | Use for                                |
| ----------------------------- | ---------------------- | -------------------------------------- |
| Production (your Cloudflare)  | `pnpm deploy:postgres` | The product, on Supabase Postgres      |
| Per-PR preview                | CI (`pr-preview.yml`)  | Reviewing changes, opt-in via repo var |
| Cloudflare self-host (Access) | `pnpm deploy:selfhost` | Private single-team installs           |
| Docker                        | `compose.yaml`         | Local trial; supports Supabase via env |

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local   # set DATAFORSEO_API_KEY, AUTH_MODE=local_noauth
pnpm db:migrate:local
pnpm dev
```

Checks that CI runs: `pnpm ci:check` and `pnpm test`.

## Repository layout

- `src/` app (routes, client features, server functions, services,
  repositories, MCP server, workflows)
- `drizzle/`, `drizzle-pg/` SQLite and Postgres migrations
- `alchemy.run.ts` Cloudflare infrastructure as code (all deploys)
- `docs/` user-facing documentation; `maintainer-docs/` engineering notes;
  `specs/` design records
- `web/` marketing and docs site (separate build; set its domain in
  `web/src/lib/site-origin.js` and `web/wrangler.jsonc`)
- `plugins/`, `.claude-plugin/`, `.agents/skills/` agent skills and plugin
  packaging

## Costs

DataForSEO is pay-as-you-go and billed to your own account. Cloudflare's free
plan runs the app for early traffic; the Workers Paid plan is needed as
Durable Object and Workflow volume grows. Supabase's free tier covers
development; use a paid project for production.

## License

MIT, see [`LICENSE`](./LICENSE). The codebase includes work originally
published under the MIT License by Ben Senescu; that notice must stay in
`LICENSE` in every copy.
