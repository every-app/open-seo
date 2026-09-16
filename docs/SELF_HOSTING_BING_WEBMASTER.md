# Self-hosting: Bing Webmaster Tools

Bing Insights connects a project to [Bing Webmaster
Tools](https://www.bing.com/webmasters) using a per-user API key — unlike
Google Search Console / Analytics, there is no OAuth app to register and no
operator-level environment variable to set. Every user pastes their own key
in the app; it works the same way on hosted OpenSEO and on a self-hosted
deployment.

## Generate an API key

1. Sign in at [bing.com/webmasters](https://www.bing.com/webmasters) and
   verify at least one site (Bing Webmaster Tools has its own site
   verification flow, separate from OpenSEO).
2. Open **Settings → API Access**.
3. Click **Generate API Key**. Bing shows the key once — copy it immediately.
4. In OpenSEO, open a project's **Settings → Integrations** page, find
   **Bing Webmaster Tools**, and paste the key in.

OpenSEO validates the key against Bing's `GetUserSites` endpoint before
storing it (encrypted, using `BETTER_AUTH_SECRET` — the same secret that
protects OAuth tokens for GSC/GA4). An invalid or mistyped key is rejected at
save time, not silently stored.

## What the key covers

Bing issues one API key per Bing account, and that key covers **every site
verified on that account** — not one key per site. If you manage several
sites in Bing Webmaster Tools, save the key once and pick which verified
site maps to each OpenSEO project from the site picker.

## Data and limits

Bing Webmaster Tools' REST API gives no start/end date parameters — each
report call returns Bing's own fixed rolling window:

- **Rank and traffic stats** (clicks/impressions): updated daily.
- **Query stats** (per-query clicks/impressions/position): updated weekly.

There is no device, country, or date-range filter, and no server-side
pagination — OpenSEO fetches the full dataset in one call and paginates the
Queries/Pages tables client-side. This is a limit of Bing's API, not
something OpenSEO can work around.

## Rotating or removing a key

Generating a new key at bing.com/webmasters does not invalidate the old one
automatically. To rotate: paste the new key into any project's Bing card —
it replaces the stored key for your user account everywhere. To stop
OpenSEO from using Bing entirely, disconnect the project(s) using **Change
property → Disconnect**; deleting your OpenSEO user account also deletes the
stored key.
