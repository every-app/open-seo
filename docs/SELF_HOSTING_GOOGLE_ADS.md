# Self-hosted Google Ads (Local Services Ads)

Connecting Google Ads lets OpenSEO report on Local Services Ads (LSA): leads,
spend, cost per lead, and budget pacing, in the dashboard and through the
`get_local_services_performance` / `get_local_services_leads` MCP tools, and
file a one-shot lead-feedback survey through `provide_lead_feedback`. The
connection is optional. OpenSEO never mutates campaigns or budgets.

## What you'll need

- A Google account with access to the Ads account that runs the Local
  Services campaigns (directly, or through a manager account).
- The same Google Cloud OAuth client used for Search Console / GA4
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`).
- A Google Ads **developer token** with at least read-only access approved.

## 1) Get a developer token and API access

The API Center only exists on Google Ads **manager accounts**. Create one at
[ads.google.com/home/tools/manager-accounts](https://ads.google.com/home/tools/manager-accounts)
if you don't have one, link the Ads account that holds your Local Services
campaigns under it, then open **Tools → API Center** on the manager account and
request a developer token.

New tokens start at test-account-only access. Apply for **Basic Access** with a
read-only reporting use case; reports against production accounts fail with
`DEVELOPER_TOKEN_NOT_APPROVED` until Google approves it. OpenSEO surfaces that
state as "access pending" rather than an error.

## 2) Enable the Google Ads API

In the [Google Cloud Console](https://console.cloud.google.com/), on the same
project as the OAuth client, enable the
[Google Ads API](https://console.cloud.google.com/apis/library/googleads.googleapis.com).

## 3) Register the callback URL

Open **APIs & Services → Credentials**, edit the Web application OAuth client,
and add an authorized redirect URI matching the deployment origin plus
`/api/gads/oauth/callback`.

| Deployment   | Redirect URI                                              |
| ------------ | --------------------------------------------------------- |
| Deployed     | `https://your-openseo-domain.com/api/gads/oauth/callback` |
| Local Docker | `http://localhost:3001/api/gads/oauth/callback`           |

Keep the existing `/api/gsc/oauth/callback` and `/api/ga4/oauth/callback` URIs
if those integrations use the same client.

## 4) Set environment variables

On top of the Google OAuth client variables, set:

```
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
```

The token is server-only; it is never exposed to the browser.

## 5) Connect from the app

Open the project's **Settings → Integrations → Local Services Ads** card and
click **Connect with Google**. Google asks for the `adwords` scope (Google Ads
has no narrower read-only scope). OpenSEO issues report queries and, through
`provide_lead_feedback`, one irreversible lead-feedback survey. It never
changes campaigns or budgets. After consent, pick the Ads account that holds
the Local Services campaigns —
accounts where OpenSEO detects LSA campaigns are badged. Accounts reached
through a manager are queried with the manager set as `login-customer-id`
automatically.

## Notes

- Lead details include consumer names, phone numbers, and emails. They stay in
  Google; OpenSEO fetches them on demand and stores only the account selection.
- The API version is pinned in `src/server/lib/googleAdsClient.ts`; Google
  sunsets each major version roughly a year after release, so expect to bump
  it periodically.
