# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server, let agents and CI in without a human login, and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

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

## Let an agent or CI in without a human login

Managed OAuth above covers MCP clients that can open a browser. A fully
headless caller — a self-hosted agent, a scheduled job, CI — cannot complete
the email one-time-code that `ACCESS_ALLOWED_EMAILS` requires, so every request
it makes stops at the Access gate. Give it a **service token** instead.

1. In Cloudflare Zero Trust, go to `Access controls` -> `Service auth` and
   create a service token. Save the Client ID and Client Secret — the secret is
   shown once.
2. Put the token's **ID** (the UUID in the token's URL, *not* the Client ID) in
   `.env.selfhost`, comma-separating several:

   ```bash
   ACCESS_SERVICE_TOKEN_IDS=00000000-0000-0000-0000-000000000000
   ```

3. Redeploy. This adds a Service Auth policy to the Access application
   admitting exactly those tokens.
4. The caller sends the credentials as headers on every request:

   ```bash
   curl https://YOUR_WORKER_HOSTNAME/mcp \
     -H "CF-Access-Client-Id: <client id>" \
     -H "CF-Access-Client-Secret: <client secret>"
   ```

Add the policy in `.env.selfhost`, not in the dashboard — like the email
allow-list, a policy added by hand is overwritten on the next deploy.

**Treat a service token as equivalent to a listed email.** Access issues these
tokens with no `sub` and no `email`, so OpenSEO maps each one to a synthetic
user in the same shared workspace everyone else uses. The token holder reads
and writes your real projects, and its actions are attributed to the token's
name rather than to a person.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
