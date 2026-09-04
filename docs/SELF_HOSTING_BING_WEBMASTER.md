# Self-hosted Bing Webmaster Tools

Connecting Bing Webmaster Tools lets OpenSEO read Bing search traffic,
keywords, crawl health, and inbound-link counts for a verified site. It is
optional and uses the read-only `Webmaster.read` OAuth scope.

## 1) Register an OAuth application

In [Bing Webmaster Tools](https://www.bing.com/webmasters/), open **Settings →
API Access** and register an application. Set its redirect URI to the exact
public origin of this OpenSEO deployment plus:

```text
/api/bing/oauth/callback
```

For example:

```text
https://seo.example.com/api/bing/oauth/callback
```

Bing allows one redirect URI per OAuth client and rejects localhost redirect
URIs. Register a separate client for each public deployment.

## 2) Configure OpenSEO

Set all three values in the environment used by the deployment:

| Variable             | Value                                    |
| -------------------- | ---------------------------------------- |
| `BING_CLIENT_ID`     | Client ID from Bing Webmaster Tools.     |
| `BING_CLIENT_SECRET` | Client secret from Bing Webmaster Tools. |
| `BETTER_AUTH_SECRET` | Random value of at least 32 characters.  |

`BETTER_AUTH_SECRET` encrypts stored access and refresh tokens. Generate one
if the deployment does not already use it for another OAuth integration:

```sh
openssl rand -base64 32
```

For a Cloudflare self-host deployment, put the values in `.env.selfhost` and
redeploy with `pnpm deploy:selfhost --yes`. The client secret and encryption
secret are deployed as secret bindings.

## 3) Connect a site

Open a project's **Settings → Integrations**, choose **Connect with Bing**,
authorize an account, and select one of its verified sites. Owners and admins
can change or disconnect the project-wide selection; members can read the
connected data but cannot alter it.

## Troubleshooting

- If OpenSEO says the integration is not configured, verify that both Bing
  credentials and a 32-character `BETTER_AUTH_SECRET` reached the Worker.
- If Bing rejects the redirect URI, compare it character-for-character with
  the deployment origin plus `/api/bing/oauth/callback`.
- If no site is selectable, verify it in Bing Webmaster Tools for the account
  that completed OAuth, then reconnect.
