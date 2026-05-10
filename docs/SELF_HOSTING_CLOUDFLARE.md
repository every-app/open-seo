# Cloudflare Self-Hosting

This guide covers:

1. Initial setup after clicking Deploy to Cloudflare
2. How to update to the latest OpenSEO version
3. How to add teammates
4. How to connect the OpenSEO MCP server through Cloudflare Access

## Initial setup

### 1) Deploy from GitHub

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

Click the deploy button, there are lots of fields on the deploy form, but you only need to do the below steps.

1. Connect your Git provider (GitHub/GitLab).
2. Leave the resource naming fields as default unless you have a reason to change them.
3. Click `Create and Deploy`.
4. Wait 1-2 minutes for deployment to finish.

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
6. Save.

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
