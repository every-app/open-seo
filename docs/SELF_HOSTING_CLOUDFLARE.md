# Cloudflare Self-Hosting

Host OpenSEO on Cloudflare for internet-facing self-hosting across multiple devices or with your team. One deploy command provisions everything. Works on Cloudflare's free plan.

You sign in with email and password accounts: the first visitor creates the administrator's account, teammates join from invitation links, and MCP clients (Claude, ChatGPT, Codex, Cursor) sign in with the same accounts, with nothing to set up in Cloudflare. The most secure option is to put [Cloudflare Access](#cloudflare-access-the-most-secure-option) in front of the app instead, so Cloudflare checks every request before it reaches OpenSEO. It takes more setup.

Related guides:

- [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md): connect the MCP server, manage accounts, telemetry.
- [Legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): maintenance for installs created with the retired Deploy-button or manual Wrangler flows.

## Prerequisites

- **Node 22.6 or newer** and **pnpm** (`corepack enable` sets it up).
- **A Cloudflare account with R2 enabled.** Activating R2 requires a payment method on file, even within its free tier — if you have never used R2, open `R2` in the Cloudflare dashboard once.
- **A DataForSEO account** — see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md).

## 1) Clone your OpenSEO repo

Fork `every-app/open-seo` on GitHub if you want a repo you control, then clone it locally:

```bash
git clone https://github.com/YOUR_GITHUB_USER/open-seo.git
cd open-seo
corepack enable
pnpm install
```

If you do not need a fork, clone the upstream repo instead:

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
corepack enable
pnpm install
```

## 2) Log in to Cloudflare (once)

```bash
pnpm alchemy login                # the default scopes are enough
pnpm alchemy cloudflare bootstrap # deploys alchemy's state-store Worker to your account
```

## 3) Create `.env.selfhost`

Copy the template and set `DATAFORSEO_API_KEY`; everything else is optional:

```bash
cp deploy/.env.selfhost.example .env.selfhost
```

## 4) Deploy

```bash
pnpm deploy:selfhost --yes
```

This provisions the D1 database, KV namespaces, and R2 bucket, applies the database migrations, deploys the Workers, and generates the session secret. The secret is kept in Alchemy's state in your account, so later deploys keep everyone signed in.

## 5) Create your account

1. Open the Worker URL printed at the end of the deploy.
2. Create the administrator's account. Do this right after the deploy finishes: registration closes once the first account exists, and until then anyone who finds the URL could claim the installation.
3. OpenSEO loads with a default project. Add your website to get started.

If something fails, see Troubleshooting below.

## Giving teammates access

Invite them from Team settings. The app copies an invitation link; the invited address creates its own account from that link and joins your workspace. There is no email delivery, so send the link yourself. Everyone works in one shared workspace and sees the same projects.

## Connecting MCP clients

MCP clients connect to `https://YOUR_WORKER_HOSTNAME/mcp` and sign in with your OpenSEO account, the same way they connect to the hosted service. Follow the [MCP setup guide](https://openseo.so/docs/mcp) with your Worker URL in place of the hosted one.

## Forgot a password?

There is no email delivery, so an operator resets passwords from a terminal. See [Manage accounts](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#manage-accounts).

## Updating to the latest OpenSEO version

```bash
git pull        # or: git fetch upstream && git merge upstream/main, if you forked
pnpm install
pnpm deploy:selfhost --yes
```

## Cloudflare Access: the most secure option

With `AUTH_MODE=cloudflare_access`, Cloudflare's own login protects the Worker: every request is checked at Cloudflare's edge before it reaches OpenSEO, and only the emails you list get through. It needs an extra login scope, a Zero Trust team (created for you), and Zero Trust settings before MCP clients can connect, so expect more setup. Choose the sign-in mode before your first deploy; the two keep separate user records.

1. In `.env.selfhost`, set `AUTH_MODE=cloudflare_access` and `ACCESS_ALLOWED_EMAILS` (comma-separated).
2. Add the `access:write` scope to your Cloudflare login: run `pnpm alchemy login --configure`, answer yes to "Customize OAuth scopes?", and select `access:write` alongside the defaults.
3. Run `pnpm deploy:selfhost --yes`. The deploy creates the Cloudflare Access application protecting the Worker (allowing exactly `ACCESS_ALLOWED_EMAILS`). If the account has no Zero Trust team yet, one is created for you, named after your workers.dev subdomain.

Open the printed URL and sign in with Cloudflare Access. To add teammates, add them to `ACCESS_ALLOWED_EMAILS` and redeploy; dashboard edits to that Access policy are overwritten on the next deploy. To manage the Access application yourself, set `TEAM_DOMAIN` (`https://your-team.cloudflareaccess.com`) and `POLICY_AUD` (the application's audience tag) instead — the deploy then provisions no Access resources. MCP clients need Managed OAuth turned on for the Access application; see [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#through-cloudflare-access).

Deployments created before password accounts existed have no `AUTH_MODE` in `.env.selfhost`, which still means Cloudflare Access, so they keep working unchanged. Deployments upgraded from older versions (which gave each user a separate workspace) show a one-time dashboard banner — clicking it migrates all previous per-user work into the shared workspace.

## Troubleshooting

- `https://<your-worker-hostname>/api/health` reports runtime configuration checks and database status.
- Cloudflare Access login fails: re-check `ACCESS_ALLOWED_EMAILS` in `.env.selfhost` and redeploy.
- For server errors, open the Worker `Logs` or run `pnpm exec wrangler tail`. Site audits run in a separate worker: `pnpm exec wrangler tail open-seo-selfhost-audit`.

## Tearing it down

```bash
pnpm alchemy destroy --env-file .env.selfhost --stage selfhost
```

This deletes the Workers, the stage-suffixed D1/KV/R2 resources (including your data), and the Access application if the deploy created one.

## Next steps

See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) for managing accounts, connecting MCP clients, and telemetry.
