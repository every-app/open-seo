# 0012 — Structured-data validation (fork-only)

Status: accepted (fork feature). Implemented on `feat/structured-data-validation`.

## Context

The request: automated Schema.org validation plus Google Rich Results checks
when drafting markup — framed explicitly as **verification, not a ranking
strategy**. That framing matters, because it decides what has to be built:
the useful artifact is "this markup is wrong, here is the field", not "add
schema and rank better".

Three candidate sources were assessed (docs checked 2026-07-30):

**1. Search Console URL Inspection API — already wired, mostly discarded.**
[`gscClient.inspectUrl`](../src/server/lib/gscClient.ts) →
`GscService.inspectUrls` → the `inspect_urls` MCP tool (and Sam). But our type
narrows rich results to `richResultsResult?: { verdict?: string }`, dropping
every issue Google reports. The real shape is:

```
richResultsResult.verdict             VERDICT_UNSPECIFIED | PASS | PARTIAL | FAIL | NEUTRAL
  .detectedItems[].richResultType     "Breadcrumbs", "FAQ", "Product", …
    .items[].name
      .issues[].issueMessage          e.g. "Missing field 'name' (in 'author')"
      .issues[].severity              SEVERITY_UNSPECIFIED | WARNING | ERROR
```

Its limits are hard, and none of them are worked around:

- **Index state only.** Google: _"Presently only the status of the version in
  the Google index is available; you cannot test the indexability of a live
  URL."_ So it cannot serve the drafting case — not for a snippet, not for
  staging, not for an uncrawled URL — and a fix shipped this morning shows
  nothing until Google recrawls.
- **Verified property only**, resolved per project through the existing
  connection.
- **Quota 2,000 QPD / 600 QPM per property** (10M QPD per API project). Enough
  for a bounded sample; not enough to fan out over a full audit crawl.

**2. There is no API for the thing people expect.** The Rich Results Test has
no public API — Google retired the Structured Data Testing Tool API and never
replaced it — and `validator.schema.org` exposes no official API either. Any
pre-publish validation is ours to build or not have.

**3. DataForSEO is a paid path we do not want here.** The installed
`dataforseo-client` already ships `OnPageMicrodata*` types with per-field
`test_results`, but `OnPageMicrodataRequestInfo` requires an OnPage crawl task
`id`. Our site audit is our own cheerio crawler
([`page-analyzer.ts`](../src/server/lib/audit/page-analyzer.ts)), not a
DataForSEO OnPage crawl, so adopting it means standing up a second metered
crawl pipeline to buy what a local validator does for free.

Meanwhile the crawler is already one line from the data: `page-analyzer.ts`
matches `script[type="application/ld+json"]` and throws the contents away to
set a `hasStructuredData` boolean.

## Decision

**Two verdicts, kept separate, never merged.** The local validator is
advisory and pre-publish. Search Console is authoritative and post-crawl. Both
surfaces name their source, and the local one never claims to predict
rich-result eligibility — it reports what Google's documented requirements say
about markup we parsed ourselves. Presenting a single blended "score" would
manufacture confidence we do not have.

**GSC: widen, don't rebuild.** `UrlInspectionResult.richResultsResult` gains
`detectedItems[].items[].issues[]`; `mobileUsabilityResult.issues` and
`ampResult` come along for the ride at no cost. The `inspect_urls` text
summary lists each non-PASS `richResultType` with its first ERROR message, and
prints `indexStatusResult.lastCrawlTime` beside the verdict so nobody reads a
stale FAIL as current. The tool stays stateless and read-only; nothing is
stored.

**Validator: `src/server/lib/structured-data/`, pure and network-free.**
Extraction is the only DOM-aware part (`extract.ts`); everything after it is a
walk over parsed JSON. The three passes live in their own modules —
`validate.ts` (parse + walk), `value-checks.ts`, `google-checks.ts` — over
shared plumbing in `findings.ts`. Findings carry a stable `code`, a `severity`,
a JSON pointer to the offending node, and a human message. A code's layer and
severity come from one registry (`FINDING_TYPES`, mirroring
`AUDIT_ISSUE_TYPES`) so no call site can pair them inconsistently. The three
layers:

- `parse` — invalid JSON, empty script, non-schema.org `@context`, top-level
  arrays and `@graph` unwrapping. Malformed JSON-LD is the single most common
  real-world defect and is a finding in its own right, not a crash.
- `vocabulary` — unknown `@type`; property not valid for the type or any
  supertype; value type outside `rangeIncludes`; malformed `@id`/URL/Date/
  DateTime/Duration literals; enumeration members that are not members.
- `google` — required and recommended properties per rich-result feature.

**The vocabulary is a committed codegen artifact.**
`scripts/generate-schema-vocabulary.ts` pins a schema.org release, compiles
its JSON-LD dump down to type → supertypes/properties and property →
`rangeIncludes`, and writes `vocabulary.generated.ts` with the release version
in a header. Runtime never fetches schema.org; the build never needs network;
the Worker bundle is deterministic; and a vocabulary bump is a reviewable
commit rather than a silent behaviour change.

**The Google rules table is hand-written, small, and dated.** Nine feature
types — Article, BreadcrumbList, Product, Recipe, Event, JobPosting,
LocalBusiness, VideoObject, Organization — each entry carrying its required
properties, recommended properties, `docsUrl`, and a `checkedOn` date. Types
with no entry are reported as _"no eligibility rules for this type"_, never as
passing. Google changes eligibility, so a large table is a wrong-answer
machine; the list stays short on purpose and the dates make staleness visible.

The list is nine rather than the ten first proposed because **FAQ is gone**:
reading the docs on 2026-07-30 turned up that Google stopped showing FAQ rich
results in May 2026 and withdrew the page in June, and HowTo went in August 2023. Both are therefore `RETIRED_FEATURES` entries that raise an `info`
finding — the markup is still valid Schema.org, and the point is to stop people
maintaining it for a rich result that no longer exists. This is exactly the
drift the dated table exists to make visible.

**Requirements apply at every depth; recommendations only to what the page is
about.** Running Google's recommended-property lists over every nested node
produced four "missing recommended properties" warnings on one New York Times
homepage — one per nested `publisher`/`subOrganization` — which buries the
findings that matter. Recommendations and feature verdicts are therefore
evaluated on top-level entities and on whatever `mainEntity` /
`mainEntityOfPage` points at. Required-property errors keep firing at any
depth, because a nested entity missing a required property is broken wherever
it sits.

**JSON-LD only in v1.** Microdata and RDFa need a full parser for a small
share of real-world usage.

**cheerio stays off the worker's eager startup graph.** It is on the
`EAGER_DENYLIST` in `vite-plugin-lean-worker-bundle.ts`, reachable only behind
the crawler's dynamic import. The validator therefore takes a loaded document
(`validateCheerioDocument`) for the crawl path and imports cheerio dynamically
in the raw-HTML path, which makes `validateHtml`/`validateMarkup` async. The
snippet path (`validateJsonLdText`) needs no HTML parser at all and stays
synchronous.

**Audit integration keeps reporters pure.** Extraction and validation run
inside `page-analyzer`, where cheerio already runs once. Findings ride on
`CrawledPageResult` as a transient field, exactly as `isHtml`, `images`, and
`links` already do, so `runPageReporters` stays DOM-free and pure. Persisted:
two counters on `audit_pages` (`structured_data_errors`,
`structured_data_warnings`) alongside the existing `hasStructuredData` — an
additive, both-DB migration. Two new `AUDIT_ISSUE_TYPES` entries carry the top
messages in `details`: `invalid-structured-data` (severity `warning` — broken
markup, not a broken site) and `incomplete-rich-result` (severity `info` —
valid but ineligible).

**MCP: one tool, `validate_structured_data`.** Accepts either `markup` (a
JSON-LD snippet or a full HTML document) or `url`, returning findings grouped
by block with a per-type eligibility summary. It takes `projectId` because
`withMcpProjectAuth` is the only auth boundary the MCP surface has, even
though the validation itself is project-independent. No credits; no new
credentials; `openWorldHint: true` because the `url` form fetches.

**No new tables and no history.** Nothing here is a time series: draft
validation is a spot check, per-page results live on `audit_pages`, and GSC
inspection stays stateless. Same reasoning as 0011's absent
`psi_connections`.

## Consequences

- **Our verdict will sometimes disagree with Google's**, because we are not
  running Google's parser. Both surfaces label their source and the local one
  says so in copy. This is the design, not a defect to paper over.
- **The rules table is standing maintenance.** `checkedOn` dates surface
  drift; ten types is a deliberate ceiling on that cost.
- The generated vocabulary (Schema.org 30.0: 933 classes, 1,521 properties, 81
  enumerations) costs **146 KB raw / 36 KB gzipped** — a rounding error against
  the Workers limit. If it ever matters, the table can move to R2 behind a
  cached read without changing the validator's signature.
- **Our verdict under-reports rather than false-alarms**, and four cases prove
  it was needed: Google's own `query-input` searchbox key is not a Schema.org
  property; unit-bearing quantities (`"334kcal"`) are correct despite a numeric
  range; an enumeration member is valid even when the range also allows a class
  (`suitableForDiet`); and `price` (Number **or** Text) cannot be format-checked
  at all. Each of these flagged correct markup on a real page before it was
  fixed, and each now has a regression test.
- **No bulk GSC inspection from audits.** 2,000 QPD per property cannot cover
  a large crawl, so rich-results verification stays user-initiated and
  URL-scoped in v1. A quota-aware sampling sweep would follow
  `SiteAuditWorkflow`'s pattern, not extend a server function.
- Pairs with the existing `schema-markup` skill: draft → validate → fix, with
  no network round trip in the loop.
- All user-facing copy frames this as verification. Nothing in the UI should
  imply that adding markup improves rankings.
- Fork-only migration numbers upstream may reuse — the standing cost recorded
  by 0009, 0010, and 0011. Renumber on upstream sync.

## Out of scope

- Live-URL rich-results testing — impossible via any API Google offers.
- Site-wide Search Console _Rich results_ enhancement reports — no API exists;
  only per-URL inspection does.
- Microdata and RDFa extraction.
- Validation history, trends, regression alerts.
- Generating or auto-fixing markup. This spec verifies; it does not author.
