# 0013 — Sitemap and indexation reconciliation (fork-only)

Status: proposed
Date: 2026-07-30

## Context

OpenSEO can answer "is this URL indexed?" one URL at a time, and "what did the
crawler find?" per audit. It cannot answer the question that sits between them:
**do the set of URLs you publish, the set Google can reach, and the set Google
indexed actually agree?**

That gap is not a missing API call. Three URL sets already exist in the product
and are never compared:

| Set             | Where it lives today                                                                             | Fate                                               |
| --------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Sitemap URLs    | `discoverUrls()` in `src/server/lib/audit/discovery.ts`                                          | Truncated to the crawl seed budget, then discarded |
| Crawled URLs    | `audit_pages` (url, statusCode, canonicalUrl, robotsMeta, headerCanonicalUrl, internalLinkCount) | Retained per audit                                 |
| Indexed samples | URL Inspection, on demand                                                                        | Not stored                                         |

The sitemap side is the specific loss. `discoverUrls` already does the hard
parts — robots.txt parsing, sitemap-index recursion, per-document retry,
same-origin filtering, cycle detection — and then:

- caps the returned list at `maxPages` (line 269), because the crawler wants
  seeds, not an inventory;
- reports `failedDocs`, `timedOutDocs` and `fetchedDocs` to `console.warn`
  rather than returning them;
- keeps no per-document provenance, so "which sitemap contained this URL" and
  "which sitemap failed to parse" are both unanswerable.

Sitemaps are treated as a _seed source_. Reconciliation needs them as a
_dataset_. That is the whole of the problem.

Google's Sitemaps API (`webmasters/v3/sites/{siteUrl}/sitemaps`) is also
unused. It supplies submission state — last downloaded, warning and error
counts, `isPending`, `isSitemapsIndex` — which is Google's own view of the
sitemaps and cannot be derived by fetching them ourselves.

Prompted by a technical SEO review (Hermes), which ranked this the
highest-return addition achievable inside OpenSEO.

## Decision

### Retain what discovery already computes

Add a discovery mode that returns the full inventory rather than the seed list:
every URL with the sitemap document that declared it, plus per-document
outcome (fetched / failed / timed out / parse error) and, for parse failures,
the offending line. No new parsing — the existing recursion is the source, the
change is what it hands back and what the caller keeps.

Retaining a full inventory has a cost the seed cap was avoiding: an uncapped
list can exceed the ~1 MiB Workflow step-state limit. The inventory therefore
persists to its own table as it is discovered rather than riding step state.

### Reconcile three sets, report five diffs

1. **In sitemap, never crawled** — declared but unreachable from the crawl
   graph, or blocked.
2. **Crawled, absent from sitemap** — discovered pages Google may reach and
   rank without you intending it.
3. **In sitemap, non-indexable** — declared URLs carrying `noindex`, a
   non-canonical `canonicalUrl`, a 4xx/5xx `statusCode`, or a redirect. This is
   the highest-signal diff: it is a direct contradiction between two things the
   site asserts.
4. **Indexable but orphaned** — crawled, indexable, zero internal inbound
   links. Requires inbound counts; `audit_pages.internalLinkCount` is outbound,
   so this needs the link graph the crawler already walks to be retained.
5. **Sitemap health** — parse errors with the exact line, plus Google's
   submission state from the Sitemaps API.

### Say what is sampled and what is surveyed

Diffs 1–4 are computed over the full inventory and are complete statements.
Index status is not: URL Inspection is rate-limited and per-URL, so any
indexed/not-indexed count is a **sample**, and must be labelled as one
wherever it appears. This is the same failure the recent PSI and validator
fixes addressed — a surface that reads as complete when it is partial. It is a
requirement, not a caveat.

### robots.txt and X-Robots-Tag

Report the exact invalid line and which user-agents it affects, matching what
the PageSpeed path now does for its `robots-txt` audit rather than inventing a
second presentation. `headerCanonicalUrl` is already captured; surface
`X-Robots-Tag` conflicts against the on-page `robotsMeta` in the same view.

## Consequences

- One new table for the sitemap inventory, one for per-document health. Both
  keyed to an audit run, so the reconciliation is a snapshot with the same
  lifecycle as the crawl that produced it, not a live query.
- `discoverUrls` gains a second return shape. The crawler's existing call site
  must keep its current behaviour and cap exactly as it does now — the seed
  path is on the hot path of every audit and this spec must not slow it.
- Sitemaps API access needs no new OAuth scope: the existing Search Console
  grant covers it.
- Reconciliation runs after the crawl completes, so it is a new workflow step,
  not a new crawl phase.
- Large sitemaps become a real cost. A 50,000-URL sitemap is 50,000 rows per
  audit. Needs a retention rule before this ships, not after.

## Out of scope

- **hreflang validation** (return links, conflicting language targets). Named
  in the same review and genuinely adjacent, but it is a different data model —
  a graph of reciprocal claims across URLs, not a set diff. Separate spec.
- **Aggregate Page Indexing, Crawl Stats, manual actions, security issues.**
  No API exists; documented in `web/content/docs/mcp.md` rather than worked
  around.
- **Rendered-DOM reconciliation.** Sitemap-vs-crawl comparison here is over
  server HTML. Raw-versus-rendered is its own spec and likely needs Browser
  Rendering.
- **Continuous monitoring.** Snapshot per audit run first. Trend lines only
  once the snapshot proves useful.

## Open questions

1. **Inventory retention.** Per-audit rows are simplest and matches how
   `audit_pages` already behaves, but 50k-URL sitemaps across daily audits will
   dominate storage. Cap the inventory, keep only the diffs after N days, or
   store the inventory as a single compressed R2 blob like the PageSpeed
   payloads?
2. **Index-status sampling strategy.** Which URLs get inspected when the quota
   only covers a sample — the diff rows, a random sample for an unbiased
   estimate, or highest-traffic pages from GSC performance? These answer
   different questions and the choice determines what the number means.
3. **Orphan detection cost.** Diff 4 needs a retained inbound link graph. Is
   that in scope here, or does it wait for a spec of its own?
