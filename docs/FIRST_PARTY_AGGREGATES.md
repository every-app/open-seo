# First-party aggregate signals

OpenSEO can receive daily, privacy-safe business funnel snapshots at:

```text
POST /api/site-signals/v1/aggregates
```

Create a source from **Project settings → Integrations → First-party
aggregates**. The generated 256-bit secret is encrypted at rest with
`BETTER_AUTH_SECRET` and displayed only once. Rotating a source immediately
invalidates its previous secret. Each project has one source, so its daily
landing totals cannot be double-counted by overlapping emitters.

## Payload

Each batch is a complete, immutable snapshot for one UTC day. A source accepts
exactly one batch per day; exact retries are idempotent and a second batch for
the same day is rejected. This bounds retained history to one snapshot per day.

```json
{
  "schemaVersion": 1,
  "batchId": "f1a2ae17-b157-4bb9-b1a1-960ce8d4c01d",
  "snapshotDate": "2026-09-04",
  "rows": [
    {
      "landingPath": "/pricing",
      "searchStarted": 120,
      "searchCompleted": 96,
      "searchNoResults": 8,
      "registrationsCompleted": 21,
      "checkoutStarted": 12,
      "paymentsCompleted": 9
    }
  ]
}
```

Only the six nonnegative counters shown above are accepted. Do not send
amounts, users, sessions, orders, search terms, email addresses, or other
identifiers. Every `landingPath` must be an exact public pathname configured on
the source. Query strings, fragments, private application paths, and common
identifier-shaped path segments are rejected. Every configured path must
appear exactly once, including paths whose six counters are all zero.

Payloads are capped at 256 KiB and 1,000 landing rows. Snapshots older than 400
days or dated in the future are rejected. Cloudflare deployments delete one
bounded page of expired batches on the daily scheduled event and throttle
authenticated ingestion to 120 requests per source per minute. Docker and
other self-hosted runtimes do not dispatch that Cloudflare cron: an integration
manager can invoke the same project-scoped, 250-batch cleanup page from the
integration card. If it reports more work, run it again. Cleanup never performs
an unbounded delete.

## Authentication and idempotency

Send these headers:

```text
Content-Type: application/json
X-OpenSEO-Source: <source UUID>
X-OpenSEO-Timestamp: <Unix seconds or milliseconds>
X-OpenSEO-Signature: <lowercase hex HMAC-SHA256>
```

The signed message is the UTF-8 timestamp, one literal period, and the exact
request body bytes:

```text
HMAC-SHA256(secret, timestamp + "." + exactRawBody)
```

OpenSEO accepts at most five minutes of clock skew. Reformatting JSON after
signing invalidates the signature.

`batchId` is an opaque UUID idempotency key within a source. Replaying the same
ID and exact payload after completion returns HTTP 200 without another write.
An exact retry while the first request still owns the processing lease returns
HTTP 202 with `status: "in_progress"` and a `Retry-After` header. Reusing an ID
with different bytes, or submitting a different batch for the same UTC date,
returns HTTP 409. Treat the ID as an opaque technical key; never derive it from
a user, session, order, search term, or other business identifier. A newly
accepted batch returns HTTP 202.

The MCP and SAM tools `get_first_party_funnel` and
`get_first_party_landing_conversions` expose only aggregate counts and derived
rates for an authorized OpenSEO project.
