# IndexNow integration POC

Status: proof of concept
Tracking issue: [#101](https://github.com/every-app/open-seo/issues/101)

## Scope

Each project can generate one 32-hex public IndexNow key. OpenSEO shows the
exact same-host HTTPS file location that the site owner must publish, verifies
the file, and then enables manual or MCP-triggered URL notifications.

The MCP surface follows the issue proposal: `submit_urls_indexnow(projectId,
urls, confirmed)`. It requires `integration:manage` and explicit
`confirmed: true`. The UI uses the same server-side service and permission
gate.

There is no scheduler, sitemap importer, target-site write, or search-engine
indexing claim in this POC.

## Safety and receipt semantics

- Key verification accepts only HTTPS on the exact normalized project origin,
  performs fail-closed A and AAAA DNS checks, disables redirects, uses a 10s
  timeout, and caps the streamed body at 256 bytes.
- Submitted URLs must use that same origin, may not include credentials, query
  strings, fragments, or common private application path prefixes.
- Requests accept at most 10,000 URLs, deduplicate them, and send chunks of
  1,000 with concurrency capped at three.
- Stored submission history contains aggregate counts and numeric HTTP status
  codes only. URL lists and response bodies are not persisted.
- `received` means the IndexNow endpoint accepted the notification. It never
  means that a URL was crawled or indexed.

The key is public by protocol design, so it is not encrypted or treated as an
application secret. Project and organization deletion cascade configuration
and receipt history.

## Data model

`indexnow_configs` stores the project key, verified same-host location, and
verification timestamp. `indexnow_submissions` stores the last ten displayable
receipts per project as aggregate counts; the database retains older receipts
until their project/configuration is deleted.

D1 and PostgreSQL definitions are maintained in parallel and covered by the
canonical schema-parity test.
