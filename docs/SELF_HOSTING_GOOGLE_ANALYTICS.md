# Self-hosted Google Analytics (GA4)

Connecting Google Analytics (GA4) lets OpenSEO pull your real sessions, users,
and channel-mix data (organic search, direct, referral, email, paid), straight
from Google — the total-visits and traffic-source questions Search Console
can't answer on its own.

It's **optional** and **independent of Search Console**: you can connect
either, both, or neither. Connecting one never requires re-authorizing or
affects the other.

## What you'll need

- A Google account with access to your GA4 property.
- ~10 minutes in the [Google Cloud Console](https://console.cloud.google.com/).
- The same three environment variables Search Console uses, if you've already
  set those up — see [step 4](#4-set-environment-variables).

## 1) Enable the required APIs

In the same Google Cloud project you use (or would use) for Search Console:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the
   [Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com)
   — this is what actually queries report data.
3. Enable the
   [Google Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com)
   — this is what lists the GA4 properties your account can see, for the
   property picker after you connect.

## 2) Configure the OAuth consent screen

Under **APIs & Services → OAuth consent screen** — same requirements as
Search Console. If you've already done this for Search Console, there's
nothing more to do here; the same OAuth client is reused for both.

## 3) Create or reuse an OAuth client ID

If you already have an OAuth client configured for Search Console, reuse it —
just add one more **Authorized redirect URI** to it:

| Deployment   | Redirect URI                                             |
| ------------ | --------------------------------------------------------- |
| Deployed     | `https://your-openseo-domain.com/api/ga4/oauth/callback` |
| Local Docker | `http://localhost:3001/api/ga4/oauth/callback`           |

The scheme, host, and port must match exactly, with no trailing slash. If
you're starting from scratch, follow steps 2–3 of the
[Search Console guide](SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md) to create the
client first, then add this redirect URI to it.

## 4) Set environment variables

Analytics uses the same three variables as Search Console — set them once,
they cover both connections:

| Variable               | Value                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`     | Client ID from step 3.                                                  |
| `GOOGLE_CLIENT_SECRET` | Client secret from step 3.                                              |
| `BETTER_AUTH_SECRET`   | A random string of **at least 32 characters** (encrypts stored tokens). |

If Search Console is already connected, these are already set and you can
skip straight to [step 5](#5-restart-and-connect).

## 5) Restart and connect

Restart OpenSEO so it picks up the new redirect URI / variables:

```bash
docker compose up -d --force-recreate open-seo
```

Then open **Integrations** (or Project Settings), click **Connect with
Google** under the Analytics card, authorize the Google account that has
access to your GA4 property, and pick the property to bind to your project.

## How it works

- Analytics gets its own OAuth grant, independent of Search Console's — a
  separate provider ID, separate scope (`analytics.readonly`), separate stored
  connection. Connecting or disconnecting one never touches the other.
- OpenSEO stores the resulting grant with access and refresh tokens
  **encrypted at rest** (keyed by `BETTER_AUTH_SECRET`), same as Search
  Console.
- Access tokens are minted and refreshed on demand — you only authorize once.
- Analytics data comes from your own Google account, so OpenSEO never meters
  credits for it.

## Troubleshooting

**`redirect_uri_mismatch` from Google** — the redirect URI in your OAuth
client must exactly equal `<your-origin>/api/ga4/oauth/callback`. Re-check
scheme (`http` vs `https`), host, port, and that there's no trailing slash.

**"Google OAuth client not configured" / "not configured for Analytics yet"**
(in the app or via the MCP tools) — one of `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, or `BETTER_AUTH_SECRET` is missing, or the secret is
shorter than 32 characters. Set all three and restart. On Docker, recreate the
container so Compose reapplies `.env`:

```bash
docker compose up -d --force-recreate open-seo
```

**`access_denied` during sign-in** — the Google account isn't listed as a test
user on the OAuth consent screen (while the app is in Testing mode). Add it
under **OAuth consent screen → Test users**.

**Connected, but no properties to pick** — the Google account you authorized
doesn't have access to a GA4 property. Check
[Google Analytics Admin → Property Access Management](https://analytics.google.com/)
to confirm the account has at least Viewer access, then reconnect.
