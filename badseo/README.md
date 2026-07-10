# badseo.dev

**A test site full of SEO mistakes.**

badseo.dev is a set of open-source web pages. Each page breaks one common
technical-SEO rule: a missing `<title>`, a redirect loop, a page nothing links
to, thin content. Point an SEO crawler at it and check what the crawler catches.

It is also the end-to-end test fixture for the
[OpenSEO](https://openseo.so) site audit. Every page lists the audit issues it
should trigger, and a harness runs the real audit engine against a running copy
to check that it does.

Maintained by the team behind [OpenSEO](https://openseo.so), an open-source SEO
tool.

---

## What's covered

Every issue type in the OpenSEO audit engine is exercised by at least one page
(the harness enforces this). Pages are grouped by category:

| Category                     | Pages                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Head tags & headings**     | missing title, title too long/short, missing meta, meta too long, missing H1, multiple H1, heading-level skip |
| **Content quality**          | thin content, images missing alt, duplicate content, duplicate title, duplicate meta description              |
| **Indexability & canonical** | noindex (meta + `X-Robots-Tag` header), canonicalized to another URL, conflicting canonicals                  |
| **HTTP status & links**      | 404, 500, 403 (blocked), broken internal link                                                                 |
| **Redirects**                | redirect chain, redirect loop, trailing-slash canonical (redirect-cycle trap)                                 |
| **Performance**              | slow server response (TTFB)                                                                                   |
| **Site structure**           | orphan page, deep click-path                                                                                  |
| **Kitchen sink**             | one page that breaks six ways at once                                                                         |

Browse them all at `/catalog`.

## How it's built

A single, dependency-free Cloudflare Worker (`src/index.ts`) that serves
hand-authored HTML with byte-level control over every SEO signal — status codes,
redirects, response headers (`X-Robots-Tag`, `Link: …; rel=canonical`), response
timing, and the raw `<head>`. No framework: SSR machinery tends to _fix_ the very
things we're trying to break (it insists on injecting a `<title>`, etc.).

- `src/index.ts` — router: fixtures → URLs, plus `robots.txt` and `sitemap.xml`.
- `src/lib.ts` — page rendering. The shared chrome (nav, footer, the OpenSEO
  badge, the "what this page tests" panel) is deliberately **SEO-neutral**: it
  emits no `<h1>`–`<h6>` and no `<img>`, so each fixture fully controls its own
  headings and images and the audit measures exactly the defect we injected.
- `src/fixtures/*.ts` — the fixtures, one file per category.
- `src/pages.ts` — the homepage and catalog (both must audit clean).

## Run it locally

```bash
# from the badseo/ directory (uses the repo's wrangler)
npx wrangler dev            # serves on http://localhost:8787
```

## Google Analytics 4 and consent

The production environment is configured with the public GA4 measurement ID
`G-7MXV9FH7SS`, but the committed `GA4_ADMIN_VERIFIED` safety gate remains
`false` until the GA Admin checklist below is complete. Once enabled, analytics
uses global, opt-in **Basic Consent Mode**: no Google Analytics tag, Analytics
request, or cookieless ping is loaded before an affirmative choice.

badseo.dev does not need a Google-certified CMP because it uses GA4 only and
does not use AdSense, Ad Manager, or AdMob. Google permits a custom consent
solution for Analytics. The first-party implementation here avoids loading a
second consent vendor while still keeping an operator-accessible audit trail:

1. The browser queues all four Consent Mode v2 defaults as denied.
2. **Accept analytics** posts a pseudonymous receipt to the same-origin
   `/analytics-consent` endpoint.
3. The Worker rate-limits and validates the request, then writes an append-only
   record to `CONSENT_LOG`. The record contains the server time, exact notice
   and choices, notice/privacy versions, measurement ID, and grant state. It
   does not include the visitor's IP address or user agent.
4. Only a successful KV write lets a newly accepted choice grant
   `analytics_storage` and load GA. Later page views rely on the unexpired,
   matching-version, matching-measurement-ID necessary browser receipt. A
   timeout, quota error, or storage outage during a new grant leaves analytics
   off and offers a retry. Same-origin tabs synchronize grants and withdrawals.
5. Withdrawal denies consent and removes `_ga` cookies immediately. Its ledger
   event is retried on the next page view if the first write fails and the
   browser can retain the necessary retry marker. If browser storage itself is
   unavailable, the page still attempts the write immediately and remains
   analytics-off regardless of its outcome.

The necessary browser receipt is treated as expired after 400 days and removed
on the next visit. Operator-side consent events expire after 830 days, covering
that possible grant period plus the configured 14-month GA4 user-level and
event-level retention window. Do not export those records; update the policy
and implement an equivalent per-event deletion schedule before introducing any
separate evidence store. Have privacy counsel revisit the evidence period if
the analytics retention or legal requirements change. Bump the canonical
notice version in `src/consent.ts` whenever the vendor, purpose, choices, or
material wording changes; a measurement-ID change automatically invalidates
stored grants. Never rewrite an old notice version.

Wrangler automatically provisions separate local and production KV namespaces
from `wrangler.jsonc`. The root Worker is deliberately named `badseo-dev`; the
production environment retains its existing implicit identity,
`badseo-production`, so a plain preview deploy cannot overwrite the production
Worker or its bindings. Production deploys must use `--env production` because
bindings and variables do not inherit into named environments.

On the first production deploy, Wrangler writes the provisioned KV namespace ID
back into `wrangler.jsonc`. Review and commit that generated ID immediately so
ledger continuity is explicit in later diffs. Monitor consent-endpoint 429/503
responses and the KV write quota; add an account-level WAF/rate-limit rule for
`/analytics-consent` if automated abuse appears. To inspect the operator-side
ledger after deployment:

```bash
npx wrangler kv key list \
  --binding CONSENT_LOG \
  --env production \
  --remote \
  --prefix analytics-consent/
```

Before production deployment, finish these GA Admin settings:

1. Keep all four **Account Data Sharing Settings** off.
2. In Enhanced Measurement, keep page views, scrolls, and outbound clicks on;
   turn the other events off.
3. Set user-level and event-level data retention to 14 months.
4. Leave Google Signals and advertising personalization off. Do not set a
   User-ID, link Google Ads, or import user data.
5. Review the badseo.dev policy at `/privacy`; it deploys with this Worker, so
   the consent notice and policy cannot drift across separate applications.
6. Verify the default and update signals with Tag Assistant, then confirm one
   consented page view in GA Realtime.
7. Only after steps 1–6 pass, set `GA4_ADMIN_VERIFIED` to `"true"` in the
   production environment and run the production dry-run again.

For local browser testing, inject a non-production ID without editing the
Wrangler config:

```bash
npx wrangler dev \
  --var GA4_MEASUREMENT_ID:G-TEST123 \
  --var GA4_ADMIN_VERIFIED:true
```

The browser consent UI is injected by `/analytics.js`, not included in the raw
page HTML. This keeps its text and controls out of the crawler fixtures' word
counts, heading checks, image checks, and duplicate-content hashes.

The Worker fails closed if the GA Admin verification gate is not `"true"`, or
if the measurement ID, KV binding, or rate-limit binding is absent:
`/analytics.js` only removes stale choices and `_ga` cookies, and no consent UI
or Google request is produced.

## Run the end-to-end audit

The harness drives the **real** OpenSEO crawl + issue-detection functions
(imported straight from `../src`) against a running badseo.dev, then asserts every
fixture triggers exactly the issues it declares — and that the homepage,
catalog, privacy policy, and support pages come back clean.

```bash
# with `wrangler dev` running in another terminal:
npx tsx scripts/run-audit.ts http://localhost:8787
```

It prints a per-page pass/fail matrix and an issue-type coverage line, and exits
non-zero on any mismatch — so it works as a CI gate for the audit engine.

## Add a fixture

Contributions are welcome — a new fixture _is_ a new regression test. Each is a
small object:

```ts
const myFixture: Fixture = {
  path: "/category/my-mistake",
  category: "Content quality",
  name: "My SEO mistake",
  summary: "One-line description shown in the on-page test panel.",
  lesson: "Why it matters / how to fix it.",
  expectedIssues: ["thin-content"], // the audit issue ids this page must trigger
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: myFixture,
        title: "…",
        metaDescription: "…",
        bodyHtml: "…",
      }),
    ),
};
```

Then add it to its category's exported array. `expectedIssues` is type-checked
against the real audit registry, and the harness will hold you to it.

Guidelines:

- **Isolate one issue per page.** A themed page should be healthy in every way
  _except_ the defect it demonstrates, so the audit result is unambiguous. (The
  kitchen-sink page is the deliberate exception.)
- **Keep titles and meta descriptions unique** across the site, or you'll create
  accidental duplicate-title / duplicate-meta groups. The exceptions are the
  intentional duplicate pairs.
- **Keep the copy plain.** Say what the page does and why the mistake matters.
  No hype.

## Deploy

There's no bundling build — wrangler/esbuild bundles `src/index.ts` on deploy.
The `build` script is a typecheck (`tsc --noEmit`) that runs before the deploy:

```bash
npm run build                          # typecheck the Worker source
npm run deploy                         # build, then wrangler deploy → badseo.dev
```

`npm run deploy` runs `npm run build && wrangler deploy --env production`. To
deploy without the typecheck gate, run `npx wrangler deploy --env production`
directly.

First-time setup: the `production` env in `wrangler.jsonc` binds the custom
domains `badseo.dev` and `www.badseo.dev`, so the zone must be on the Cloudflare
account before the first deploy. Production disables `workers.dev` and preview
URLs so the real GA ID is served only on those custom domains. To preview on the
separate `badseo-dev` `*.workers.dev` Worker without the custom domain or real
measurement ID, deploy the top-level env with `npx wrangler deploy`.
