# Self-hosted Google Analytics

Connecting Google Analytics lets OpenSEO bind a GA4 property to a project. The
connection is optional and read-only.

## What you'll need

- A Google account with access to the GA4 property.
- A Google Cloud project with OAuth credentials.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET` set on
  the OpenSEO deployment.

If Search Console is already connected, reuse the same Google Cloud project and
OAuth client. GA4 still asks for a separate consent grant.

## 1) Enable the Analytics APIs

In the [Google Cloud Console](https://console.cloud.google.com/), enable both:

- [Google Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com)
- [Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com)

The Admin API lists properties during connection. The Data API powers the
read-only reports added in later GA4 milestones.

## 2) Configure the OAuth consent screen

Under **APIs & Services → OAuth consent screen**, configure the app. While the
app is in Testing, add every Google account that will connect as a test user.

## 3) Register the callback URL

Open **APIs & Services → Credentials**, edit the Web application OAuth client,
and add an authorized redirect URI matching the deployment origin plus
`/api/ga4/oauth/callback`.

| Deployment   | Redirect URI                                             |
| ------------ | -------------------------------------------------------- |
| Deployed     | `https://your-openseo-domain.com/api/ga4/oauth/callback` |
| Local Docker | `http://localhost:3001/api/ga4/oauth/callback`           |

Keep the existing `/api/gsc/oauth/callback` URI if Search Console uses the same
client.

## 4) Set environment variables

Set these values and restart OpenSEO:

| Variable               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Web application client ID.                                |
| `GOOGLE_CLIENT_SECRET` | Web application client secret.                            |
| `BETTER_AUTH_SECRET`   | Random string of at least 32 characters for token crypto. |

Generate the encryption secret with:

```sh
openssl rand -base64 32
```

## 5) Connect a property

Open a project dashboard or **Project settings → Analytics**, click **Connect
with Google**, approve read-only Analytics access, and choose a GA4 property.

OpenSEO stores the OAuth tokens encrypted in Better Auth's account table. The
project mapping stores only the selected property metadata and connector
account. Disconnecting GA4 does not disconnect Search Console.

## Troubleshooting

**`redirect_uri_mismatch`** — make sure the registered URI exactly matches the
scheme, host, port, and `/api/ga4/oauth/callback` path used by the deployment.

**No properties appear** — confirm that the Analytics Admin API is enabled and
the connected Google account has access to the property.

**Connection expired** — reconnect the Google account. OAuth apps left in
Google's Testing status can receive short-lived refresh grants.
