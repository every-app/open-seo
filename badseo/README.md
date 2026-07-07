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

## Run the end-to-end audit

The harness drives the **real** OpenSEO crawl + issue-detection functions
(imported straight from `../src`) against a running badseo.dev, then asserts every
fixture triggers exactly the issues it declares — and that the homepage, catalog,
and support pages come back clean.

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
account before the first deploy. (The routes live under `production` so that
plain `wrangler dev` still serves on localhost.) To preview on a `*.workers.dev`
URL without the custom domain, deploy the top-level env: `npx wrangler deploy`.
