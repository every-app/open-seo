# IndexNow deployment webhooks

OpenSEO can submit changed URLs to IndexNow after a deployment or CI job. The
endpoint is:

```text
POST /api/webhooks/indexnow
```

It is intentionally independent of browser authentication. Configure both
environment variables on the OpenSEO server:

```dotenv
INDEXNOW_WEBHOOK_SECRET=replace-with-a-long-random-secret
INDEXNOW_WEBHOOK_HOSTS=example.com,www.example.com
```

`INDEXNOW_WEBHOOK_HOSTS` is an exact, comma-separated host allowlist. It must
match the `host` saved in an enabled IndexNow project configuration. Do not use
wildcards or include paths.

Send either `X-IndexNow-Webhook-Secret: <secret>` or
`Authorization: Bearer <secret>`. The payload may contain changed URLs:

```json
{
  "urls": [
    "https://example.com/changed-page",
    "https://example.com/another-page"
  ]
}
```

`changedUrls` and a single `url` are also accepted. If no URL is supplied, the
webhook discovers the configured site's homepage and sitemap URLs. URLs must
be HTTP(S), public, and on the configured host. Payloads are limited to 64 KiB
and 2,000 URLs; each project submits at most 500 URLs per hit.

Successful submissions are deduplicated against the IndexNow event ledger for
five minutes. A repeated deploy hook therefore does not resubmit unchanged
URLs, while failed or older submissions remain eligible for retry.

Example:

```sh
curl -X POST https://app.example/api/webhooks/indexnow \
  -H 'content-type: application/json' \
  -H 'x-indexnow-webhook-secret: replace-with-a-long-random-secret' \
  --data '{"urls":["https://example.com/changed-page"]}'
```
