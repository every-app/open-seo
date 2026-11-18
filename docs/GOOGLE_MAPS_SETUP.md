# Google Maps setup for Local SEO

Local SEO uses Google's Map Tiles API for its basemap. OpenSEO gets
the ranking results from DataForSEO. Viewing the map requests Google tiles;
running a ranking scan uses DataForSEO credits separately.

## Create the Google Cloud key

1. Select or create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. [Enable billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
   for that project, then enable **Map Tiles API** in the API Library.
3. In **APIs & Services > Credentials**, create an API key.
4. Set its API restriction to **Map Tiles API** only and save it.
5. If your server has fixed outbound IP addresses, use the **IP addresses**
   application restriction to allow those addresses. Website referrer
   restrictions do not apply to this server integration. Cloudflare Workers
   do not provide a fixed outbound IP by default, so do not enter your app's
   domain or its inbound IP address here.
6. Set a daily tile-request quota in **Google Maps Platform > Quotas** that
   fits your usage. Use separate keys for development, previews, and production
   to keep their usage separate.

OpenSEO's server requests Google sessions, tiles, and viewport copyright
information. The browser loads tiles through an authenticated OpenSEO route;
the Google key and session tokens stay on the server. Follow Google's
[API-key security guidance](https://developers.google.com/maps/api-security-best-practices)
when setting restrictions. You only need Map Tiles API for the basemap.

## Configure OpenSEO

Add the key as `GOOGLE_MAPS_API_KEY` in the environment file for your app:

- Local development: `.env.local`.
- Hosted production: `.env.production`.
- Alchemy self-hosting: `.env.selfhost`.
- Preview deployments: `.env.preview`.

Set the variable to the key you created. It is a server secret and is not
included in the client build. The Google
OAuth client ID and secret used for Search Console are separate credentials.

Restart the development process after changing the key:

```sh
pnpm dev:agents
```

For Cloudflare deployments, the Alchemy deploy commands read the respective
environment file and install the key as a Worker secret. For deployments
managed outside Alchemy, set `GOOGLE_MAPS_API_KEY` as a runtime secret on the
app Worker. Docker reads it from `.env` when the container starts. Restart
or redeploy the server after changing the key; it does not need to be in the
Vite build environment.

Open a project's **Local SEO** screen and choose **Add Business** to select
its Google Maps listing and coverage grid. Enter the search terms you want to
track during setup, or use **Manage keywords** after saving.

**Check rankings** checks every tracked keyword at every grid point. The
confirmation shows the total searches and estimated cost. **Latest** shows the
current results for each keyword; **History** compares saved checks by date.
Select a keyword or a history cell to open its map.

A grid preview displays the basemap before you buy a ranking check. You should
see Google Maps branding, copyright information, and grid markers. The map
stays fitted to the grid. Click a completed point's marker to see the
businesses ranking there.

## Maps in Local SEO reports

The same key draws the rank grid in Local SEO agent reports as a live map,
including for anyone you share a report link with. Those readers are not
signed in, so each report carries a link that loads tiles only for the area
around its own grid and expires after a day. Each time someone opens a report
with a map, it requests Google tiles. Without a key, reports show the grid as
a drawing instead.

## Missing maps

- **Google Maps is not configured:** set the server key and restart or
  redeploy the app.
- **Request failed (403):** check billing, Map Tiles API enablement, and the
  key's API and server IP restrictions.
- **Request failed (429):** check the project's Maps quotas and usage.
- **Tiles could not load:** inspect requests to `/api/local-seo/maps/` in the
  browser's Network panel. Check that you are signed in and can access the
  project, then check server connectivity, key configuration, and quotas.
  Use the map's retry button after correcting the issue.

The **Points** view remains available when maps cannot load. OpenSEO renews
Google's session tokens and displays Google's attribution for the current
viewport. It streams tiles without storing them for offline use. Browser
caching follows Google's response headers; the proxy does not create a
shared tile cache.

## Billing and attribution

Google bills tile requests, and one map view makes several of them. Check Google's
[current pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
and [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies).
Keep the Google Maps logo and data copyright visible when customizing the
map. The bundled Google Maps logo comes unchanged from Google's official
attribution assets linked in those policies.
