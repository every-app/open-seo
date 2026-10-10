# Self-hosted Bing Webmaster Tools

Connecting Bing Webmaster Tools lets OpenSEO pull your real clicks,
impressions, positions, and crawl details, straight from Bing — through the
Search Performance page (Google | Bing toggle), the project dashboard card,
and two MCP tools.

It's **optional**: OpenSEO runs fine without it, just without Bing data.
There are two ways to connect, and only the first needs any setup here:

- **Connect with Bing (OAuth)** — one click per Bing account, no pasting.
  Needs the OAuth client registered below.
- **Paste an API key** — needs nothing on the server. Any member pastes their
  own per-account key in Integrations or Personal settings.

## What you'll need (OAuth path only)

- A Bing Webmaster Tools account with verified sites.
- ~5 minutes in Bing Webmaster Tools — no Cloud project, no consent screen.

## 1) Register an OAuth client

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters) and open
   **Settings → API Access → OAuth Client**.
2. Click **Create** and fill in:
   - **Client Name**: `OpenSEO` (shown to users on the consent screen).
   - **Redirect URI**: exactly your deployment's origin plus
     `/api/bing/oauth/callback`:

   | Deployment | Redirect URI                                              |
   | ---------- | --------------------------------------------------------- |
   | Deployed   | `https://your-openseo-domain.com/api/bing/oauth/callback` |
   | Local dev  | `http://localhost:3001/api/bing/oauth/callback`           |

   Bing holds a single exact-match URI per client, so register a separate
   client per environment. Scheme, host, and port must match exactly, with no
   trailing slash.

3. Save, then copy the **Client ID** and **Client secret**.

## 2) Set environment variables

Set these values, then redeploy so the worker picks them up:

| Variable             | Value                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `BING_CLIENT_ID`     | Client ID from step 1.                                                                            |
| `BING_CLIENT_SECRET` | Client secret from step 1.                                                                        |
| `BETTER_AUTH_SECRET` | A random string of **at least 32 characters** (encrypts stored OAuth tokens and pasted API keys). |

`BETTER_AUTH_SECRET` is not needed for normal self-hosting — only for the
Google and Bing integrations, because the stored credentials are encrypted at
rest with it. Generate one with:

```sh
openssl rand -base64 32
```

Where to set them:

- **Docker self-hosting:** `.env`
- **Cloudflare (alchemy):** `.env.selfhost` — the deploy reconciles worker
  vars on every run, so values set in the dashboard get wiped; keep them in
  the file.
- **Local development:** `.env.local`

Without `BING_CLIENT_ID`/`BING_CLIENT_SECRET`, the app simply hides the
Connect-with-Bing button and the paste-an-API-key flow keeps working.

## 3) Deploy and connect

Redeploy OpenSEO so it picks up the new variables (Cloudflare:
`pnpm deploy:selfhost --yes`; Docker: recreate the container so Compose
reapplies `.env`).

Then open **Integrations**, click **Connect with Bing**, authorize the Bing
account that owns your verified sites, and pick the site to bind to your
project.

## How it works

- OpenSEO uses your Bing client to run the OAuth flow and stores the resulting
  grant in its database, with the access and refresh tokens **encrypted at
  rest** (keyed by `BETTER_AUTH_SECRET`). One grant per user — Bing's token
  response carries no account identity to key a second grant on.
- Access tokens are minted and refreshed on demand — you only authorize once,
  and the refresh token stays valid until you disconnect.
- Bing data comes from the connected account, so OpenSEO never meters credits
  for it.

## Troubleshooting

**`redirect_uri_mismatch` from Bing** — the redirect URI on your Bing OAuth
client must exactly equal `<your-origin>/api/bing/oauth/callback`. Re-check
scheme (`http` vs `https`), host, port, and that there's no trailing slash.
Bing allows only one URI per client, so a local and a deployed install need
separate clients.

**No "Connect with Bing" button** — one of `BING_CLIENT_ID`,
`BING_CLIENT_SECRET`, or `BETTER_AUTH_SECRET` is missing, or the secret is
shorter than 32 characters. Set all three and redeploy.

**`access_denied` during sign-in** — the Bing account declined the consent
screen. Connect again and approve read access (`webmaster.read`).

**"Bing rejected that API key" on a pasted key** — the key is wrong, revoked,
or not the account-level API key (a per-site IndexNow key won't work — the
account key lives under Settings → API Access).

**Connected, but no sites to pick** — the authorized Bing account has no
verified sites. Verify the site in
[Bing Webmaster Tools](https://www.bing.com/webmasters) first, then reconnect.
