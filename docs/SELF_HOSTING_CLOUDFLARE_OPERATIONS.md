# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server, manage accounts, render JavaScript in site audits, and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

## Connect the MCP server

With password accounts (`AUTH_MODE=password`, the default for new deployments), MCP clients connect to `https://YOUR_WORKER_HOSTNAME/mcp` and sign in with your OpenSEO account, exactly as they connect to the hosted service; nothing needs to be enabled in Cloudflare. Follow the [MCP setup guide](https://openseo.so/docs/mcp) with your Worker URL in place of the hosted one.

### Through Cloudflare Access

With `AUTH_MODE=cloudflare_access`, use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Save.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

## Manage accounts

With password accounts, the first visitor creates the administrator's account and teammates join from invitation links (Team settings). There is no email delivery, so password resets and accounts outside the invitation flow are operator commands:

1. Set `OPENSEO_OPERATOR_SECRET` in `.env.selfhost` to a random value (`openssl rand -hex 32`) and redeploy. This turns on the operator endpoint, which answers only to requests carrying that secret.
2. Run the command with the password on standard input and the deployed URL in `OPENSEO_URL`. This Bash example keeps the password out of shell history and process arguments:

```bash
read -rs -p 'New password: ' password; echo
printf '%s\n' "$password" | OPENSEO_URL=https://YOUR_WORKER_HOSTNAME pnpm selfhost:admin reset-password you@example.com
unset password
```

A reset signs that user out everywhere. `pnpm selfhost:admin create-user you@example.com 'Your name'` creates an account the same way, for example to create the administrator's account from the terminal before anyone opens the URL. `OPENSEO_URL` can also live in `.env.selfhost`.

### Switching from Cloudflare Access to password accounts

Existing users keep their data, but they signed in through Cloudflare and have no password, and registration is closed once any user exists, so give each of them a password:

1. Set `AUTH_MODE=password` and `OPENSEO_OPERATOR_SECRET` in `.env.selfhost` and redeploy. The deploy removes the Access application it created, so the app is reachable without Cloudflare's login from then on.
2. Find each user's id in the `user` table of the `open-seo-db-selfhost` D1 database (Cloudflare dashboard, Storage & Databases, D1).
3. For each user, with the password on standard input as above:

```sh
OPENSEO_URL=https://YOUR_WORKER_HOSTNAME pnpm selfhost:admin claim-legacy-user USER_ID you@example.com shared-workspace
```

Everyone shares the `shared-workspace` organization; the command makes the user one of its owners.

## AI visibility tracking

AI Visibility uses your `DATAFORSEO_API_KEY`; tracked questions are sent to DataForSEO and billed directly by the provider. Set `OPENROUTER_API_KEY` for setup research, Prompt Research, and generated prompt suggestions. Deployment configures background collection and a five-minute cron that dispatches due daily, weekly, or monthly checks. The app shows the collection cost before a check or schedule starts. See the [AI Visibility guide](https://openseo.so/docs/ai-visibility).

## Render JavaScript in site audits

Site Audit can load pages in a browser before analyzing them. Turn on **Render JavaScript** when starting an audit if the site builds its content or links client-side (React and other single-page apps). Rendered audits take longer.

Rendering uses [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/) on your own Cloudflare account. The deploy binds a browser to the audit Worker, so the toggle works with no extra setup. **Rendering needs a paid Workers plan.** The free plan allows one browser action every ten seconds, which is too slow for a crawl. The paid plan includes 10 browser hours a month, then bills $0.09 per browser hour.

Some sites block Cloudflare's browser. To render those pages through [Context.dev](https://www.context.dev) instead, create a Context account, set `CONTEXT_API_KEY` in `.env.selfhost`, and redeploy. OpenSEO calls Context only for pages that Browser Run could not render, and for Shopify store pages that Shopify rate limits while project setup or AI Visibility setup reads your site. Each of those pages uses one Context credit on your Context account.

Docker deployments have no browser. On Docker, set `CONTEXT_API_KEY` in `.env.local` to render every page through Context. Until the key is set, the **Render JavaScript** toggle stays disabled with a setup note.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

Heartbeats are triggered by requests to the app or MCP server. Requests to `/api/health` do not trigger telemetry, matching Docker's behavior.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
