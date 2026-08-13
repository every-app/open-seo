# Site audit crawl architecture

## Status

Accepted

## Context

The site audit runs as a Cloudflare Workflow. The original design kept all
crawl state inside the workflow run: the URL frontier and page summaries lived
in workflow memory and step returns, pages were parsed with a full DOM parser
(cheerio), and link edges were bulk-inserted into the app database during the
crawl. On large or slow sites this collided with platform limits:

- **Isolate memory.** DOM parsing expands a page several times over, multiplied
  by concurrent parses, plus a whole-crawl summaries array that was rebuilt on
  every workflow replay.
- **Step-output cap (~1 MiB).** Sitemap seed lists flowed through step returns
  and could exceed it outright.
- **Step timeout × retry.** The default 10-minute step timeout with default
  retries meant a deterministically failing step burned about an hour before
  the audit died.
- **Batch head-of-line blocking.** Fixed-size crawl batches waited on their
  slowest fetch; one tarpit URL stalled a whole batch.
- **Invisible failure.** Workflow-level kills (OOM, CPU) skip the error
  handler, so audit rows could stay `running` forever with no recorded reason,
  and the UI refused to show the pages that had already been crawled and
  persisted.

## Decision

Split the audit into a control plane and a data plane.

### Orchestration stays in Workflows; crawl state moves to a Durable Object

`SiteAuditWorkflow` remains the orchestrator (phase ordering, durable steps,
retries). All transient crawl state lives in `AuditScratchpad`, a SQLite-backed
Durable Object, one instance per audit (`idFromName(auditId)`):

- **frontier** — URL queue and dedup set (URL primary key), with
  `pending / leased / crawled` states keyed by chunk number;
- **links** — internal link edges, primary-keyed for idempotent re-insert;
- **page_mirror** — the few columns the finalize link checks need.

The app database (D1/Postgres) keeps only what the product reads: `audits`
(plus failure columns), `audit_pages`, `audit_issues`,
`audit_lighthouse_results`. Link edges are never persisted to the app DB; the
cross-page link checks (broken internal links, orphan pages) run as SQL inside
the DO at finalize.

Rejected alternatives: Cloudflare Queues (no dedup, no counters, no completion
signal — a frontier is mostly those things), a Postgres frontier table (chatty
hot-path writes, dual-dialect surface), R2 spill files (not queryable).

### Chunked rolling crawl

The crawl phase is a loop of `crawl-chunk-N` steps. Each chunk leases up to
~200 URLs from the DO and crawls them with a rolling concurrency window: the
moment a fetch settles, the next URL launches. The window self-adjusts between
5 and 40 based on recent fetch health (errors, blocked fetches, slow responses,
oversized bodies shrink it; clean fast batches grow it). A soft deadline ends
the chunk early and releases unfetched leases. Persistence is pipelined with
fetching but serialized with itself: page rows and per-page issues go to the
app DB, link edges and frontier updates go to the DO, and progress counters
update per sub-batch. Step returns carry only counters, so no step output
scales with site size.

Everything is idempotent under step retries: chunk-keyed leases (a retried
step re-receives exactly the URLs its failed attempt held, and refuses a fresh
claim for an already-crawled chunk number), deterministic page-row ids, and
insert-or-ignore/replace writes on stable keys.

### Streaming HTML parsing

Pages are parsed with htmlparser2's streaming tokenizer — no DOM is built, so
per-page memory is constant. cheerio (which uses the same tokenizer
internally) remains only as a test reference: the parser test suite asserts
extraction parity against it, and the badseo fixture harness asserts identical
issue output end to end.

### Failure handling and graceful degradation

- `audits` carries `error_code` (a closed vocabulary mapped from real platform
  error strings — `step_timeout`, `oom`, `cpu_limit`, `db_error`,
  `step_output_too_large`, `workflow_internal`, `instance_lost`, `unknown`),
  `error_detail`, and `failed_phase`.
- A watchdog on the existing `*/15` cron reconciles audit rows stuck in
  `running` against the Workflows API; the audit status read path does the
  same lazily. Only confirmed instance-not-found errors (after a grace period)
  count as a lost instance, so transient API failures never fail a live audit.
- A failed audit shows everything crawled before the failure ("stopped early
  after N pages") instead of hiding results.
- The start URL follows redirects (with per-hop SSRF revalidation) before the
  crawl anchors its origin, so apex→www and cross-TLD redirects don't dead-end
  the crawl after one page.

### DO lifecycle and platform-limit guards

- `destroy()` (delete alarm, then all storage) runs on audit success and on
  audit deletion. Every DO construction schedules a 7-day self-cleanup alarm,
  so any instantiation — including a write racing in after destroy, or a
  workflow that dies before seeding — is eventually wiped. Failed audits keep
  their scratchpad for those 7 days as the resume/debug artifact.
- Guards where the platform has hard edges: link writes stop at a storage
  budget (below the free-plan per-object SQLite cap; orphan detection is
  skipped when the link graph was truncated), discovered-URL batches are
  capped below the serialized-RPC limit, and sitemap documents are read up to
  a byte cap and skipped whole beyond it.

## Consequences

- Workflow heap and step state are O(one chunk) regardless of site size; the
  OOM/step-output failure classes are gone by construction.
- Hostile or slow sites degrade to a slower window and finish (or fail with a
  classified reason and visible partials) instead of burning an hour of
  retries.
- Every failure is aggregable by `error_code` in plain SQL, and zombie
  `running` rows self-heal.
- Crawl-state code is provider-independent (DO SQLite exists in workerd), so
  self-host does not add a dialect surface for the frontier or links.
- The scratchpad is opaque from outside the DO; the 7-day retention of failed
  audits' state is the debugging window.
- Resume-from-frontier ("retry finishes the last N pages instead of
  recrawling") is enabled by the retained frontier but intentionally not
  built yet.
