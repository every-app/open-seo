# Local Development

## Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) (bundled through Node.js 24; install it separately on Node.js 25+)
- A DataForSEO account/API credentials

## Local Development Workflow

```sh
# Activates the exact pnpm version declared in package.json.
corepack enable
pnpm install --frozen-lockfile

# Run once per fresh local DB
pnpm run db:migrate:local
```

Verify that `pnpm --version` reports the version declared by the
`packageManager` field in `package.json`. An older global pnpm may reject
the repository's lockfile as incompatible.

Configure `.env.local`:

1. `cp .env.example .env.local`
2. Add `DATAFORSEO_API_KEY` as a base64-encoded `login:password` value:

   `printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64`

3. Set `AUTH_MODE=local_noauth` for normal local development.

Run locally:

```sh
# Option 1
pnpm run dev

# Option 2 (Recommended)
# This log file makes it easier for your coding agent to debug.
mkdir .logs
touch .logs/dev-server.log

# This command uses portless, which is great for worktrees. It also pipes logs to that fixed file, which is helpful for agent debugging output.
pnpm dev:agents
```

`pnpm dev:agents` runs through [portless](https://github.com/vercel-labs/portless) at `http://open-seo.localhost:1355` by default.

When using a git worktree, [portless](https://github.com/vercel-labs/portless) prefixes the branch name, for example `http://feature-name.open-seo.localhost:1355`.

### Flows that need the direct origin

The portless `.localhost` URL proxies most of the app, but a few flows must be
opened at the direct origin instead — `http://localhost:<port>` or
`http://127.0.0.1:<port>`, where `<port>` is printed on startup in
`.logs/dev-server.log`:

- **In-app agent (SAM) chat.** Chat history fails to load over the portless
  URL (`ERR_SSL_PROTOCOL_ERROR`). Test SAM chat at the direct origin.
- **Google Search Console OAuth.** Google rejects the portless `.localhost`
  callback hostname with `invalid_request`. Register
  `http://localhost:<port>/api/gsc/oauth/callback` as an authorized redirect
  URI in your Google OAuth consent screen, and start the connection from that
  direct origin. The dev server itself stays managed by portless.

### Stop the dev server around production builds

Running `pnpm build` while a Vite dev server is still running can corrupt the
dev server's runtime state: browser navigation fails and server functions
return `undefined`, with `Cannot read properties of undefined (reading 'map')`
in the logs. Stop the dev server (`Ctrl+C`) before a production build and
start it again afterwards. An already-affected dev server recovers on restart
— no code changes are needed.

## Report share images

To test a real report end to end, run the app with `AUTH_MODE=hosted`, share a
local report, and open its `/s/<token>/og.png` URL. Inspect the share page's
initial HTML for `og:image` and `twitter:image`, then revoke the share and check
that the image returns 404. Report saves and changes to the displayed project
hostname update the image URL's version. If rendering fails for a valid share,
the image route redirects to the existing OpenSEO marketing card.
Social platforms may retain their own previews; our image responses are
`no-store` and check access on each request. An actual social crawler needs a
publicly reachable page and image; the Access-protected preview environment
supports manual inspection but cannot be fetched by those crawlers.

## Website and BadSEO

The marketing website (`web/`) and audit test site (`tests/badseo/`) are separate
pnpm projects with their own lockfiles. The root install does not install their
dependencies. From the repository root, install the project you plan to work on:

```sh
# Marketing website
pnpm --dir web install --frozen-lockfile
pnpm --dir web run dev
# Validate website changes
pnpm --dir web run types:check
pnpm --dir web run build

# Audit test site (keep the root dependencies installed for its audit harness)
pnpm --dir tests/badseo install --frozen-lockfile
pnpm --dir tests/badseo run dev
# Validate BadSEO changes
pnpm --dir tests/badseo run build
```

Run BadSEO's audit harness from another terminal while its dev server is running:

```sh
pnpm --dir tests/badseo run audit http://localhost:8787
```

Use the root formatter for BadSEO; the website has its own formatter:

```sh
# From the repository root
pnpm exec prettier --write "tests/badseo/**/*.{ts,tsx,json,jsonc,md}"
pnpm --dir web run format:write
```

See [BadSEO's README](../tests/badseo/README.md) for fixture and audit instructions.

## Database Commands

Generate migration:

```sh
pnpm run db:generate
```

Migrate local DB:

```sh
pnpm run db:migrate:local
```

## Postgres backend (optional)

D1 (SQLite) is the default. To run against Postgres locally instead — the opt-in
backend for installs that outgrow D1 — see
[`LOCAL_POSTGRES.md`](./LOCAL_POSTGRES.md).

## Auth Modes

- `AUTH_MODE=cloudflare_access` (default): validates Cloudflare Access JWTs (`cf-access-jwt-assertion`) using `TEAM_DOMAIN` + `POLICY_AUD`.
- `AUTH_MODE=local_noauth`: local trusted mode, no auth check, injects `admin@localhost`.
- `AUTH_MODE=hosted`: Better Auth-backed email/password mode. Requires Better Auth schema generation plus `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.

Dev scripts do not set `AUTH_MODE`, so you can test another mode by changing it in `.env.local`.

For Cloudflare deployments, ensure Cloudflare Access is enabled on your Worker route/domain and provide `TEAM_DOMAIN` + `POLICY_AUD` in environment variables.
