# Site audit JavaScript rendering

"Render JavaScript" is an option on the site audit start form and the
`run_site_audit` MCP tool. A rendered audit reads the content, headings and
links that JavaScript loads.

## Availability

Two renderers exist: [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/)
through the audit worker's `BROWSER` binding, and [Context.dev](https://context.dev)
through `CONTEXT_API_KEY`. The option works when either exists:

- **Hosted and previews:** both. Every account sees the option and pays with
  usage credits.
- **Self-hosted Cloudflare (Alchemy):** the deploy binds Browser Run, so the
  option always works. The operator's Cloudflare account pays, and a paid Workers plan is
  required (the free plan allows one browser action every ten seconds).
  `CONTEXT_API_KEY` adds the Context fallback on the operator's Context account.
- **Docker and legacy Wrangler installs:** no browser. The option works only
  with `CONTEXT_API_KEY`; otherwise the toggle is shown disabled with a setup
  note.
- **Local development:** `AUDIT_BROWSER_RENDERING=true` attaches a remote
  Browser Run binding to the audit worker (needs `wrangler login`).

`isAuditRenderingAllowed` in `rendering-policy.ts` is the single check. The app
worker has no browser binding of its own, so Alchemy sets
`AUDIT_BROWSER_RENDERING=true` on it whenever it binds `BROWSER` to the audit
worker. The auth mode says nothing about which renderer exists.

## How a page is rendered

1. The crawler fetches the page directly, as before.
2. The page is rendered when the direct fetch returned readable HTML with a
   2xx status, or HTML behind a bot challenge (any `blocked` result except a
   401 login wall). Redirects, non-HTML files, origin errors, login walls and
   rate limits keep their existing paths.
3. Cloudflare renders first. Context renders only when Cloudflare fails, is
   challenged, or sees an origin error. Context costs about five times as much
   per page. Cloudflare always identifies Browser Run as a bot, so sites behind
   Cloudflare's own bot protection render through Context.
4. The rendered document replaces the direct body for analysis. The direct
   response's timing and header directives stay authoritative, and so does
   its status, except behind a challenge. There the page takes the status
   Browser Run loaded, or 200 from Context, which reports no status and
   returns only pages that loaded. Recording a status keeps every page field
   as it is; an earlier version rescued blocked pages with an unknown status,
   which made those fields nullable.
5. A rendered document that looks like a challenge is classified `blocked`,
   and one still showing the app's loading shell gets the same "content may
   require JavaScript" warning as an unrendered shell.

A render that fails on every available renderer, or returns an unusable
document (wrong final URL, empty, still loading), makes the page an unread
`error` page. A challenge that neither renderer passes stays `blocked`. A
rendered document over 1 MiB keeps its first 1 MiB, the same bound the direct
crawl reads. The audit never audits the unrendered shell in its place, and paid
calls are never retried automatically.

## Billing

Rates live in `src/shared/audit-rendering.ts`, shared by the launch form, the
MCP tool description, the reservation and the settlement:

- **Cloudflare:** every attempt is billed as its full 20 second timeout at
  $0.09 per browser hour ($0.0005), not its measured time. A flat price per
  attempt needs no millisecond accounting and makes the low estimate exact.
- **Context:** the credits Context reports, including on error responses, at
  $0.0025 each. A failure that reports no usage is not charged.

Both convert through the standard markup: about 0.64 usage credits per
Cloudflare page and 3.84 per page that falls back to Context.

Hosted rendering uses Autumn balance locks: one reservation when the audit
starts, one settlement when it ends. It takes and settles them with the same
`holdCredits` and `finalizeHold` helpers that hold every DataForSEO call, so a
timed-out Autumn check fails closed instead of reading as a hold, and a
retried finalize cannot charge twice. Unlike a single DataForSEO call, one
audit's hold is split: the monthly balance covers what it can and top-up
covers the rest.

1. `startAudit` locks the worst case, page limit × the fallback rate, from the
   monthly balance first and top-up for the remainder. Not enough across both
   refuses the audit with `INSUFFICIENT_CREDITS` before the workflow starts.
   The lock ids travel in the workflow params.
2. Each crawl chunk counts Cloudflare attempts and Context credits and returns
   them in its step result. Chunks make no Autumn calls.
3. The workflow sums the checkpointed chunk counts. At the end, whether the
   audit completed or failed, one step confirms the locks for the credits used,
   monthly first, and releases the rest.
4. Locks expire after at most 24 hours. An audit that dies without settling
   returns the hold to the customer on its own.
5. A rendered audit crawls at most 1,000 pages (`RENDERED_MAX_AUDIT_PAGES`),
   enforced like the plan page limits: `startAudit` refuses more with
   `AUDIT_PAGE_LIMIT_EXCEEDED`, and the launch form caps its page input. At
   the 20 second worst case per Cloudflare attempt, that keeps a rendered
   crawl well inside the lock's 24 hours, so settlement finds its lock.

What we absorb rather than charge: renders in a chunk attempt that failed
before returning its counts, a settlement that Autumn rejects, usage beyond
the hold (a retried chunk can render a page twice).

Alternatives considered:

- **Per-chunk deductions** (the first release): a failed deduction was logged
  while the audit kept spending, and an empty balance mid-audit silently
  switched the rest of the crawl to plain fetching.
- **Charging up front with a refund:** needs a manual refund on every failure
  path, and overcharges when the workflow dies.
- **Per-page billing:** hundreds of Autumn calls per audit.

## Open items

- **Context rate limits.** Context's Developer plan allows 60 calls a minute,
  and a busy crawl can exceed that when many pages fall back. A Context 429
  makes the page an unread `error` page. `site_audit:render` logs each Context
  `httpStatus`, so measure real 429 rates first. If they matter, pause the
  chunk on a Context 429 the way the crawler pauses on an origin 429
  (`crawl-throttle.ts`).
- **Deleting a running rendered audit.** The workflow stops before it settles,
  so the hold stays until the lock expires and the rendered pages are not
  charged.
- **Context pricing tier.** The Context rate in `audit-rendering.ts` assumes
  the Developer plan. Update it when the hosted account's plan is chosen.

## Configuration

Alchemy binds `BROWSER` and passes `CONTEXT_API_KEY` to the audit worker, and
passes `CONTEXT_API_KEY` to the app worker for the availability check. Docker
and local development read the key from `.env.local` or `.dev.vars`.

## References

- [Cloudflare Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/)
- [Context HTML scrape](https://docs.context.dev/api-reference/web-scraping/html)
- [Context pricing](https://context.dev/pricing)
- [Autumn balance locking](https://docs.useautumn.com/documentation/customers/balance-locking)
