# Cloudflare Self-Hosting: Manual Deploy with Wrangler

Use this flow if the [Deploy to Cloudflare button](./SELF_HOSTING_CLOUDFLARE.md) fails with `Cannot provision a KV Namespace with the title "open-seo" because it already exists`. The reliable path is to create Cloudflare resources yourself, put their IDs into `wrangler.jsonc`, then deploy with Wrangler.

## 1) Clone your OpenSEO repo

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

## 2) Log in to Cloudflare

```bash
pnpm exec wrangler login
```

## 3) Create Cloudflare resources

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

## 4) Edit `wrangler.jsonc`

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

## 5) Deploy

```bash
pnpm run deploy
```

## 6) Configure authentication and secrets

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

Use the domain from `JWKS_URL` for `TEAM_DOMAIN`, for example `https://your-team.cloudflareaccess.com`. Use the Access application audience value for `POLICY_AUD`. See [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md) for how to get a DataForSEO key.

## 7) Optional: add an R2 lifecycle rule

DataForSEO API responses are cached in R2 under the `dataforseo-cache/` prefix. This step is optional, but recommended to automatically clean up expired cache objects:

```bash
pnpm exec wrangler r2 bucket lifecycle add open-seo-YOUR_SUFFIX dataforseo-cache-expiry dataforseo-cache/ --expire-days 7
```

## 8) Validate setup

1. Open your Worker URL again.
2. Sign in with Cloudflare Access.
3. OpenSEO should load after login.

If login fails, re-check the three secrets, the Access toggle, and the binding values in `wrangler.jsonc`.

## Next steps

See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) for connecting MCP clients, updating to the latest OpenSEO version, and giving teammates access.
