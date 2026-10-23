# Umami analytics

Sites that use Umami instead of Google Analytics, often because Umami is
cookieless and needs no consent banner, can connect an Umami website to a
project. The dashboard, the chat, and the MCP tools then read its organic
traffic the way they read a GA4 property.

## How it works

An Umami login (server URL, an API key or a username and password, and
optional request headers) is saved once per organization, owned by whoever last
entered its credentials. Each project then points at one website on a saved
login, so an agency with one Umami server and many client sites enters the
credentials once. Saving the same URL, auth type
and username again replaces the stored secret instead of adding a copy.
Removing a login disconnects every project that reads through it.

The secret and the custom headers are encrypted with the deployment's
`BETTER_AUTH_SECRET`, the same key that encrypts the Google OAuth tokens. They
are decrypted in memory for a request and never returned to the client or an
MCP caller; the client sees the URL, auth type, username, and whether custom
headers exist. A login is checked before it is stored: OpenSEO signs in and
lists the websites, and a failure is shown next to the form.

Password logins call Umami's `/api/auth/login` and use the returned token for
the rest of that request. Tokens are not stored. Umami Cloud uses the
`x-umami-api-key` header against its API URL. The server URL passes the same
outbound URL policy as audit start URLs, and redirects are not followed, so a
login can't be pointed at a private address directly or through a redirect.

Umami websites carry no time zone, so the browser's zone is saved with the
connection when a website is picked. Reports default to the last 28 complete
days in that zone, like the GA4 reports, and convert day boundaries to Umami's
millisecond timestamps with daylight saving accounted for.

Umami has no filter for "came from a search engine", so organic traffic is
read two ways. Totals (visits, visitors, pageviews, bounces, visit time) come
from Umami's per-visit channel report, taking its `organicSearch` row, so they
match the Umami dashboard. Entry pages, referrers and the trend use Umami's
referrer regex filter, anchored to search-engine domains so that subdomains
such as `gemini.google.com` or `news.google.com` don't count. That filter is
event-level and only the entry pageview of a search visit carries the external
referrer, so it counts visits and visitors correctly but not the rest of a
visit; filtered reports leave pageviews out, and pageviews per path are read
across all traffic. Umami v2 has no regex filter and reports totals in a
different shape, so a v2 server is rejected when a website is picked rather
than reporting zeros.

Umami switches a daily series to months once a range spans more than seven
calendar months, so ranges over 180 days ask for a monthly trend and say so.

## Surfaces

- **Settings → Integrations** has an Umami card: add a login, pick a website,
  change it, disconnect the project, or remove a saved login.
- **Dashboard**: an Organic traffic card with visits, visitors, pageviews and
  bounce rate against the previous 28 days, and a daily visitors trend. When a
  project uses Umami and has no GA4 connection, the GA4 connect card is
  hidden.
- **MCP and chat**: `get_umami_organic_overview`, `get_umami_landing_pages`,
  `get_umami_page_performance` and `get_umami_traffic_sources`. They return the
  same ok/error envelope as the GA4 tools, default to organic search, and take
  `channel: "all"` for every visit.

## Alternatives

Making the GA4 tools source-agnostic would give agents one set of analytics
tools. GA4 and Umami measure different things (sessions, key events and revenue
against visits, visitors and bounces), so a shared schema would either hide
fields or invent them. Separate tools with the same envelope keep each source
honest.

Storing the login per project would be simpler, but agencies run many sites on
one Umami server and would re-enter and rotate the same password in every
project.

Using only Umami's channel grouping would keep every number on one
definition, but Umami exposes channels as a report, not as a filter, so entry
pages and referrers couldn't be limited to search visits. Using only the
referrer filter would keep one definition too, but would report every organic
visit as a one-page bounce.

Caching the login token across requests would save one login call per report.
The token is bound to the user's password and some deployments keep tokens in
Redis with an expiry, so a fresh login is the more predictable choice.

Joining Umami entry pages with Search Console pages into scored opportunities,
as `get_search_opportunities` does for GA4, is left for later.
