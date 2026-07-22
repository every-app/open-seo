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

Browse them all on the homepage at `/#issues`.

## How it's built

badseo.dev is a TanStack Start app deployed to a Cloudflare Worker, following
the same Vite and Cloudflare setup as the repository's `web/` app.

TanStack React routes render the healthy homepage and privacy policy.
A TanStack catch-all server route keeps the deliberate fixtures as raw
responses with byte-level control over status codes, redirects, headers
(`X-Robots-Tag`, `Link: …; rel=canonical`), timing, and the malformed `<head>`
states the audit needs to observe.

- `src/routes/` — TanStack pages plus raw server routes for fixtures,
  `robots.txt`, and `sitemap.xml`.
- `src/server/badseo.ts` — fixture dispatch and crawler-discovery responses.
- `src/lib.ts` — raw fixture HTML rendering. Its shared chrome is deliberately
  **SEO-neutral**: it emits no `<h1>`–`<h6>` and no `<img>`.
- `src/fixtures/*.ts` — the fixtures, one file per category.

## Analytics

Plausible Analytics loads on every page using the site-specific script supplied
for badseo.dev. It provides the cookieless aggregate baseline without changing
the Google Analytics consent choice.

Google Analytics uses measurement ID `G-7MXV9FH7SS`. The small consent script in
`public/analytics.js` is shared by TanStack pages and raw fixture documents. It
does not request Google's tag or set analytics cookies until a visitor accepts.
The visitor can reject analytics or revisit the choice from **Cookie settings**
in the footer. The choice is stored only in the visitor's browser.

## Run it locally

```bash
# from the badseo/ directory
npm run dev                 # serves on http://localhost:8787
```

## Run the end-to-end audit

The harness drives the **real** OpenSEO crawl + issue-detection functions
(imported straight from `../src`) against a running badseo.dev, then asserts every
fixture triggers exactly the issues it declares — and that the homepage,
privacy policy, and support pages come back clean.

```bash
# with `npm run dev` running in another terminal:
npm run audit -- http://localhost:8787
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

Vite builds the TanStack Start client and Worker bundles, then TypeScript checks
the project before Wrangler deploys it:

```bash
npm run build                          # Vite build + typecheck
npm run deploy                         # build + wrangler deploy → badseo.dev
```

The custom-domain routes for `badseo.dev` and `www.badseo.dev` live in
`wrangler.jsonc`, alongside the TanStack server entry and built asset directory.
