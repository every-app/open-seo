# Cloudflare Self-Hosting: Legacy Deployments

Maintenance for installs created with the retired **Deploy to Cloudflare button** or the **manual Wrangler flow**. These deployments keep working — nothing changes for you. New deployments should use the [current guide](./SELF_HOSTING_CLOUDFLARE.md).

## Updating (Deploy-button repos)

Your repo was created by the deploy button and `wrangler.jsonc` holds your resource IDs; keep them while pulling the newest code.

One-time setup:

```bash
git remote add upstream https://github.com/every-app/open-seo.git
```

Update steps:

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

## Updating (manual Wrangler deployments)

```bash
git pull
pnpm install
pnpm run deploy
```

## Giving teammates access

1. Open Cloudflare Zero Trust.
2. Go to Access -> Applications.
3. Open your OpenSEO application.
4. Edit the `Allow` policy.
5. Add teammate emails (or your company email domain / group).
6. Save.

Screenshots: [edit the Access policy](https://github.com/user-attachments/assets/c7bbc7b4-a18e-4ae4-9fe5-3b33c72048a7), [add teammate emails](https://github.com/user-attachments/assets/fa4ecaf2-31f7-4a64-9001-210cf729747b).

## Optional: R2 lifecycle rule

DataForSEO API responses are cached in R2 under the `dataforseo-cache/` prefix. Recommended so expired cache objects don't accumulate:

```bash
pnpm exec wrangler r2 bucket lifecycle add open-seo dataforseo-cache-expiry dataforseo-cache/ --expire-days 7
```

Replace `open-seo` with your bucket name if you changed it.

## Troubleshooting

**Login fails or OpenSEO doesn't load.** Re-check, on your Worker under `Settings`:

- `Domains & Routes`: `Cloudflare Access` is enabled for the `workers.dev` route.
- `Variables & Secrets`: `TEAM_DOMAIN` (for example `https://your-team.cloudflareaccess.com`), `POLICY_AUD` (the Access application audience tag), and `DATAFORSEO_API_KEY` are set.
- Manual Wrangler deployments: the binding IDs in `wrangler.jsonc` match your resources.

`https://<your-worker-hostname>/api/health` reports runtime configuration checks and database status. For server errors, open the Worker `Logs` or run `pnpm exec wrangler tail`.

**Migrating to the current flow** is not supported yet — the new deploy provisions fresh resources, so your data would not move. Keep using this page.

## Everything else

MCP setup and telemetry work the same as current deployments — see [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md).
