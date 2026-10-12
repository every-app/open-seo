# Public share links for reports

## Status

Accepted. Shipped in PR #616 on top of reports (`specs/0012-dynamic-reports.md`); the edge cache followed in PR #620.

## What it does

- A report gets a Share button with a "Public link" toggle. On, anyone with the link can open the report without signing in. Off, the link stops working. Sharing again mints a new link, so an old one never comes back.
- The link always shows the latest saved version and is hidden from search engines.
- The public page lives on the app domain and looks like a shared document: a slim bar with the title, "Made with OpenSEO", a Share button and a "Try OpenSEO" button, with the report filling the rest of the screen in the same sandboxed frame the in-app viewer uses.
- Sharing is hosted-only. A self-hosted deployment sits behind Cloudflare Access or has no auth at all, and neither can serve a link to a reader who is not signed in, so the Share button is not rendered and the server refuses the mint.

## How it works

**Data.** Two columns on `reports`: `share_token` (nullable, unique) and `shared_at`. The token is 192 random bits as 32 base64url characters, stored as-is; it is a capability, and revoking it means nulling it. Sharing mints, unsharing nulls, and content saves never touch either column.

**Public page** at `/s/<token>`: a hand-written HTML document the worker serves, not a route in the app, with no auth guard, `noindex`, and Open Graph tags from the title and the summary's first line. The bar, the frame and the preview tags are all in the first response, and the page ships no JavaScript beyond the Share button's clipboard handler. The reader is usually someone who has never opened OpenSEO, and the app's root shell renders only on the client, so a page inside it would have cost them the whole app bundle before the frame existed. The summary is markdown and the preview does not try to render it: a stray `##` costs less than a stripper that eats the minus sign off a number.

**Raw endpoint** at `/s/<token>/raw` serves the stored HTML with the same sandbox policy as the in-app route, `frame-ancestors 'self'` and a noindex header. The raw document only renders inside the frame: a request whose fetch destination is not an iframe is redirected to the wrapped page, and a client that sends no destination header is served the document, since it cannot load the wrapper's frame either. A token of the wrong shape is answered before any query.

**Edge cache.** The raw response is cacheable at the edge for 60 seconds and never in the browser, so revoking a link stops new readers within a minute. A request carrying a query string is redirected to the bare path before any lookup, so the cache key cannot be varied.

**States.** Unknown, unshared or deleted: one "not shared" page with a 404 status, so tokens cannot be probed. Archived project: 404 with the archived message; restoring the project brings the link back.

**One gate.** The mint, the public page and the raw endpoint ask the same question — is this a hosted deployment — so they cannot disagree. A self-hosted deployment is behind Cloudflare Access or has no auth at all, and neither can serve a link to a reader who is not signed in, so there sharing is refused with an ordinary validation error and every share path answers as if the link never existed.

**Sandbox facts**, checked in the three major engines: meta refresh, `javascript:` and `data:` navigations, form submission and a `<meta>` policy that adds scripts are all refused, and the origin is opaque. A clicked link only replaces the frame's content; links that open a new tab do so with the opener severed.

Shares, unshares and public views are counted in telemetry, the last with a hashed token and the user agent so link-preview bots can be excluded. Erasing a user revokes the links on the reports they created; deleting a report or project kills the link by cascade.

## Alternatives considered

- An `is_public` boolean instead of a token: the URL would be the report id, so an old link would resurrect on re-share.
- Signed URLs: expiry and signing keys for links meant to stay live until revoked, and revocation would still need a database read.
- A separate shares table: a report has at most one public link, so a table adds a join for nothing.
- Raw HTML at top level on the app hostname: one abusive account could get the hostname flagged. Wrapping every shared document in our chrome is what makes the app domain the right place.
- A separate registrable domain: overkill once the document is wrapped in our chrome.
- Sharing under the no-auth self-host mode, with a dedicated error code explaining the Cloudflare Access refusal: one hosted-only check reads better than two modes and an error code that existed for one sentence.
- ETag revalidation: a revalidation answered before the token lookup would make revocation advisory.
- Print on the public page: a cancelled print dialog leaves a bare report open top-level on the app domain. Members print from the app.
- An agent-facing share tool: sharing is a human decision made on the report page.
- A per-organization cap and a rate limit: deferred until abuse shows up.
- Edge caching: deferred out of the first PR, then added as the 60-second cache above once the query-string redirect closed the cache-key hole.
- A React route for the public page: shipped first and replaced once measured. The frame could not mount until the app bundle had loaded and hydrated, so a first-time reader waited on hundreds of kilobytes of JavaScript that a two-button bar does not need.

## Not in scope

An agent-facing share tool, a per-organization cap, rate limiting, an abuse-report link, view counts in the app, per-report preview images, embedding on third-party sites, passwords or expiry on links, indexable reports, a separate share domain.

## Later

Interactive reports are the one flip spec 0012 describes: `allow-scripts` without `allow-same-origin`, so a chart can run but has no cookies, storage or network. It is a one-way door: reports saved with scripts stop working if it is turned off again.
