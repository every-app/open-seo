# Web Analytics

Web Analytics is OpenSEO's first-party visitor tracking: see who visits your
site, where they come from, and which pages they read — measured from your own
OpenSEO deployment, with no third-party script and no cookie banner.

It's **optional** and off by default: enable it per project, then add one
script tag to your site.

## 1) Enable it for a project

Open your project in OpenSEO and click **Web Analytics** in the sidebar (under
"My Site"), then **Enable web analytics**. The project needs a site domain set
(the domain the tracker is allowed to measure).

Enabling shows you the script tag with your site's id — it looks like this:

```html
<script
  defer
  data-site-id="YOUR_SITE_ID"
  src="https://YOUR-OPENSEO-HOST/analytics/script.js"
></script>
```

## 2) Add the script to your site

Put the tag on every page — usually your layout template or `<head>`. That's
the whole install.

What you get out of the box:

- **Pageviews and visitors**, including single-page-app navigation
- **Traffic sources**: Google, X, AI assistants (ChatGPT, Claude, Perplexity,
  …), newsletters, referral tags like `?ref=launch-tweet`, and UTM parameters
- **Top pages**, countries, and devices
- **Engaged time** (time the tab was actually visible) and bounce rate
- **Goals**: add `data-wa-goal="signup_click"` to any element (extra
  `data-wa-goal-plan="pro"` attributes become goal properties), or call
  `window.openseoAnalytics("goal", "signup_click")` from your code
- **Outbound link** tracking

Disable yourself from the numbers by visiting any page of your site with
`?wa_ignore=true` (undo with `?wa_ignore=false`).

## What it collects (and doesn't)

The tracker sends the page URL (with personal-looking query parameters like
`?email=` stripped in the browser), an anonymous visitor id and session id held
in first-party cookies, the referrer, screen width, and a UA string for
browser/OS/device classification. Visitor IP addresses are never stored; the
country (and where Cloudflare reports it, region and city) comes from the
connection. Bots and crawlers are filtered.

The session cookie (`wa_sid`) slides for 30 minutes of inactivity, so a
visitor reading for an hour is one session. Safari caps script cookies at 7
days, so a returning Safari visitor after a week counts as a new visitor —
same as every cookie-based analytics tool.

## Ad blockers

Some blockers block known analytics endpoints. Because the tracker and the
ingestion endpoint live on your OpenSEO host, you can proxy them through your
own domain so they look first-party. For example, in Next.js:

```js
// next.config.js
async rewrites() {
  return [
    { source: "/stats/script.js", destination: "https://YOUR-OPENSEO-HOST/analytics/script.js" },
    { source: "/stats/event", destination: "https://YOUR-OPENSEO-HOST/api/wa/event" },
  ];
}
```

Then install the tag as:

```html
<script
  defer
  data-site-id="YOUR_SITE_ID"
  data-api="/stats/event"
  src="/stats/script.js"
></script>
```

## Turning it off

**Disable** on the Web Analytics page stops tracking and deletes all
collected visitor data for the project.

## Credits

The tracker and ingestion design are ported from
[Minilytics](https://github.com/surendrapandar/minilytics) by surendrapandar
(MIT) — a self-hosted, revenue-focused analytics tool worth a look if you need
checkout attribution.
