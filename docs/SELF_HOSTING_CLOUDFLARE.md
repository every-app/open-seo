# Cloudflare Self-Hosting

Host OpenSEO on Cloudflare for internet-facing self-hosting across multiple devices or with your team. It works on Cloudflare's free plan.

This doc covers initial setup with the Deploy to Cloudflare button. Related guides:

- [Manual deploy with Wrangler](./SELF_HOSTING_CLOUDFLARE_MANUAL.md): use this if the deploy button fails or you want full control over resources.
- [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md): connect the MCP server, update to the latest version, add teammates, telemetry.

## 1) Deploy from GitHub

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

Click the deploy button, there are lots of fields on the deploy form, but you only need to do the below steps.

1. Connect your Git provider (GitHub/GitLab).
2. Leave the resource naming fields as default unless you have a reason to change them.
3. Click `Create and Deploy`.
4. Wait 1-2 minutes for deployment to finish.

If deploy fails with `Cannot provision a KV Namespace with the title "open-seo" because it already exists`, use the [manual deploy with Wrangler](./SELF_HOSTING_CLOUDFLARE_MANUAL.md) flow instead.

## 2) Configure authentication and secrets

### Create the Access application

1. In the main Cloudflare dashboard, go to `Compute` -> `Workers & Pages` -> your OpenSEO Worker -> `Settings` -> `Domains & Routes`. Copy the `workers.dev` hostname. It looks like `open-seo.<your-subdomain>.workers.dev`.
2. Open [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
3. Go to `Access controls` -> `Applications` -> `Create new application` -> `Self-hosted and private`.
4. Name the application `OpenSEO`.
5. Under `Destinations` -> `Public hostnames`, click `Switch to custom input` and paste the exact `workers.dev` hostname from step 1. Enter only the hostname, without `https://` or a path.
6. Under `Access policies`, click `Create new policy` and configure:
   - `Policy name`: `Allow OpenSEO users`
   - `Action`: `Allow`
   - `Include` selector: `Emails`
   - Value: your Cloudflare account email
7. Do not choose `Everyone`; it allows anyone to reach the application.
8. Leave the other policy settings at their defaults, save the policy, then save the application.

### Collect the values

- `POLICY_AUD`: in `Access controls` -> `Applications`, select `Configure` on your application, then copy the `Application Audience (AUD) Tag` from `Additional settings`.
- `TEAM_DOMAIN`: `https://<team-name>.cloudflareaccess.com`. Your team name is shown in Zero Trust `Settings`. Include the `https://` prefix.
- `DATAFORSEO_API_KEY`: follow [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md).

### Set them on the Worker

1. Go to `Compute` -> `Workers & Pages` -> your OpenSEO Worker -> `Settings` -> `Variables & Secrets`.
2. Add `TEAM_DOMAIN`, `POLICY_AUD`, and `DATAFORSEO_API_KEY`.

## 3) Optional: add an R2 lifecycle rule

DataForSEO API responses are cached in R2 under the `dataforseo-cache/` prefix. This step is optional, but recommended to automatically clean up expired cache objects:

```bash
npx wrangler r2 bucket lifecycle add open-seo dataforseo-cache-expiry dataforseo-cache/ --expire-days 7
```

If you changed the R2 bucket name during deploy, replace `open-seo` with your bucket name.

Without a lifecycle rule, cached objects under `dataforseo-cache/` will accumulate indefinitely and increase storage costs over time.

## 4) Validate setup

1. Open your Worker URL again.
2. Sign in with Cloudflare Access.
3. OpenSEO should load after login.

If it doesn't, see Troubleshooting below.

## Troubleshooting

`https://<your-worker-hostname>/api/health` reports runtime configuration checks and database status. For server errors, open the Worker `Logs` or run `pnpm exec wrangler tail`.

## Next steps

See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) for connecting MCP clients, updating to the latest OpenSEO version, and giving teammates access.
