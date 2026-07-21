# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server, update to the latest OpenSEO version, give teammates access, and manage telemetry.

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
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

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, add `OPENSEO_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) as a Worker variable under **Settings → Variables & Secrets**, then redeploy or restart the Worker.
