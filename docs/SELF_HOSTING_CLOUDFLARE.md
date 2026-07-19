# Cloudflare Self-Hosting

This guide covers:

1. [Initial setup after clicking Deploy to Cloudflare](#initial-setup)
2. [Manual deploy with Wrangler](#manual-deploy-with-wrangler)
3. [How to connect the OpenSEO MCP server through Cloudflare Access](#connect-the-mcp-server-through-cloudflare-access)
4. [How to update to the latest OpenSEO version](#how-to-update-to-the-latest-openseo-version)
5. [How to add teammates](#give-teammates-access-to-openseo)

## Initial setup

### 1) Deploy from GitHub

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

Click the deploy button, there are lots of fields on the deploy form, but you only need to do the below steps.

1. Connect your Git provider (GitHub/GitLab).
2. Leave the resource naming fields as default unless you have a reason to change them.
3. Click `Create and Deploy`.
4. Wait 1-2 minutes for deployment to finish.

If deploy fails with `Cannot provision a KV Namespace with the title "open-seo" because it already exists`, use the [manual deploy with Wrangler](#manual-deploy-with-wrangler) flow instead.

### 2) Configure authentication and secrets

In the Cloudflare dashboard:

1. Go to `Compute` -> `Workers & Pages` -> your OpenSEO Worker.
2. Open `Settings`.
3. In `Domains & Routes`, enable `Cloudflare Access` for the `workers.dev` route.
4. Save the values shown by Cloudflare Access.
5. In `Variables & Secrets`, add:
   - `POLICY_AUD` (from Access setup)
   - `TEAM_DOMAIN` (domain from `JWKS_URL`, for example `https://your-team.cloudflareaccess.com`)
   - `DATAFORSEO_API_KEY`

### 3) Optional: add an R2 lifecycle rule

DataForSEO API responses are cached in R2 under the `dataforseo-cache/` prefix. This step is optional, but recommended to automatically clean up expired cache objects:

```bash
npx wrangler r2 bucket lifecycle add open-seo dataforseo-cache-expiry dataforseo-cache/ --expire-days 7
```

If you changed the R2 bucket name during deploy, replace `open-seo` with your bucket name.

Without a lifecycle rule, cached objects under `dataforseo-cache/` will accumulate indefinitely and increase storage costs over time.

### 4) Validate setup

1. Open your Worker URL again.
2. Sign in with Cloudflare Access.
3. OpenSEO should load after login.

If login fails, re-check the three secrets and Access toggle.

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients — for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Save.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

## How to update to the latest OpenSEO version

If your repo was created from the Cloudflare Deploy button, use this flow.

### One-time setup

Run this once in your local repo:

```bash
git remote add upstream https://github.com/every-app/open-seo.git
git fetch upstream
```

### Update steps (use every time)

```bash
git fetch upstream
cp wrangler.jsonc wrangler.local.backup.jsonc
git checkout main
git reset --hard upstream/main
cp wrangler.local.backup.jsonc wrangler.jsonc
git add wrangler.jsonc
git commit -m "restore Cloudflare settings" || true
git push --force-with-lease origin main
```

Why this is needed:

- `wrangler.jsonc` has your Cloudflare resource IDs.
- The update step keeps your IDs while pulling the newest OpenSEO code.

## Give teammates access to OpenSEO

1. Open Cloudflare Zero Trust.
2. Go to Access -> Applications.
3. Open your OpenSEO application.
4. Edit the `Allow` policy.
5. Add teammate emails (or your company email domain / group).
6. Save.

Screenshots from the setup flow:

- [Edit the Access policy](https://github.com/user-attachments/assets/c7bbc7b4-a18e-4ae4-9fe5-3b33c72048a7)
- [Add teammate emails to the allow list](https://github.com/user-attachments/assets/fa4ecaf2-31f7-4a64-9001-210cf729747b)

After saving, teammates can open your OpenSEO URL and sign in through Cloudflare
Access. OpenSEO will use a shared workspace for everyone allowed by the policy.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID — every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, add `OPENSEO_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) as a Worker variable under **Settings → Variables & Secrets**, then redeploy or restart the Worker.

## Manual deploy with Wrangler

Use this flow if the Deploy to Cloudflare button fails with `Cannot provision a KV Namespace with the title "open-seo" because it already exists`. The reliable path is to create Cloudflare resources yourself, put their IDs into `wrangler.jsonc`, then deploy with Wrangler.

### 1) Clone your OpenSEO repo

Fork `every-app/open-seo` on GitHub if you want a repo you control for future updates, then clone it locally:

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

### 2) Log in to Cloudflare

```bash
pnpm exec wrangler login
```

### 3) Create Cloudflare resources

Use unique names so they do not collide with resources that already exist in your Cloudflare account. Replace `YOUR_SUFFIX` with something unique to you, for example your GitHub username or company name.

```bash
pnpm exec wrangler kv namespace create open-seo-YOUR_SUFFIX
pnpm exec wrangler kv namespace create open-seo-oauth-YOUR_SUFFIX
pnpm exec wrangler d1 create open-seo-YOUR_SUFFIX
pnpm exec wrangler r2 bucket create open-seo-YOUR_SUFFIX
```

Save the IDs and names printed by Wrangler:

- The first KV namespace ID is for the `KV` binding.
- The second KV namespace ID is for the `OAUTH_KV` binding.
- The D1 `database_id` is for the `DB` binding.
- The R2 bucket name is for the `R2` binding.

### 4) Edit `wrangler.jsonc`

Open `wrangler.jsonc` and replace only your Cloudflare resource values. Keep the binding names exactly as shown below, because the application code expects those names.

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "YOUR_KV_NAMESPACE_ID",
  },
  {
    "binding": "OAUTH_KV",
    "id": "YOUR_OAUTH_KV_NAMESPACE_ID",
  },
],
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "open-seo-YOUR_SUFFIX",
    "database_id": "YOUR_D1_DATABASE_ID",
    "migrations_dir": "drizzle",
  },
],
"r2_buckets": [
  {
    "bucket_name": "open-seo-YOUR_SUFFIX",
    "binding": "R2",
  },
],
```

Do not use `wrangler deploy --update-config` for this step. Edit `wrangler.jsonc` manually so `"migrations_dir": "drizzle"` stays in the D1 database config.

### 5) Deploy

```bash
pnpm run deploy
```

### 6) Configure authentication and secrets

In the Cloudflare dashboard:

1. Go to `Compute` -> `Workers & Pages` -> your OpenSEO Worker.
2. Open `Settings`.
3. In `Domains & Routes`, enable `Cloudflare Access` for the `workers.dev` route.
4. Save the values shown by Cloudflare Access.

Then set the same values as Worker secrets with Wrangler:

```bash
pnpm exec wrangler secret put TEAM_DOMAIN
pnpm exec wrangler secret put POLICY_AUD
pnpm exec wrangler secret put DATAFORSEO_API_KEY
```

Use the domain from `JWKS_URL` for `TEAM_DOMAIN`, for example `https://your-team.cloudflareaccess.com`. Use the Access application audience value for `POLICY_AUD`.

### 7) Optional: add an R2 lifecycle rule

DataForSEO API responses are cached in R2 under the `dataforseo-cache/` prefix. This step is optional, but recommended to automatically clean up expired cache objects:

```bash
pnpm exec wrangler r2 bucket lifecycle add open-seo-YOUR_SUFFIX dataforseo-cache-expiry dataforseo-cache/ --expire-days 7
```

### 8) Validate setup

1. Open your Worker URL again.
2. Sign in with Cloudflare Access.
3. OpenSEO should load after login.

If login fails, re-check the three secrets, the Access toggle, and the binding values in `wrangler.jsonc`.
