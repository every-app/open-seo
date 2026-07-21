# OpenSEO Security Research Report

Date: 2026-07-21
Repository: https://github.com/every-app/open-seo
Reviewed copy: `/tmp/open-seo`

## Summary

This review found one likely CVE-worthy issue in the site audit crawler and two secondary security-relevant issues.

The strongest candidate is an SSRF weakness in audit discovery: OpenSEO validates the user-provided audit start URL, but later discovery fetches for `robots.txt` and sitemap XML use the platform default redirect behavior. A malicious audited website can redirect those discovery requests to a private/internal target before OpenSEO validates the final URL.

## Finding 1: SSRF Through Audit Discovery Redirects

Severity: Medium
CWE: CWE-918, Server-Side Request Forgery
Affected component: Site audit crawler discovery

### Affected Code

- `src/server/features/audit/services/AuditService.ts`
  - `startAudit()` validates the initial `startUrl` with `normalizeAndValidateStartUrl()`.
- `src/server/workflows/siteAuditWorkflowPhases.ts`
  - `runDiscoveryPhase()` calls `discoverUrls(origin, maxPages)`.
- `src/server/lib/audit/discovery.ts`
  - `fetchRobotsTxtText()` fetches `${origin}/robots.txt` without `redirect: "manual"`.
  - `fetchSitemapDocumentWithRetry()` fetches sitemap URLs without `redirect: "manual"`.

The main page crawler handles this correctly:

- `src/server/workflows/site-audit-workflow-helpers.ts`
  - `crawlPage()` uses `redirect: "manual"` and records redirect targets instead of automatically following them.
- `src/server/lib/scrape.ts`
  - `fetchText()` also uses `redirect: "manual"` and revalidates redirect targets.

### Impact

An authenticated user who can start a site audit can provide a domain they control. That domain can return a redirect from `/robots.txt` or `/sitemap.xml` to an internal/private URL.

Depending on runtime/network configuration, this may allow:

- Requests to loopback services such as `127.0.0.1`.
- Requests to link-local metadata services such as `169.254.169.254`.
- Requests to private RFC1918 services reachable from the OpenSEO deployment.
- Internal service probing via response timing/status behavior.

Cloudflare Workers deployments may be partially mitigated by `global_fetch_strictly_public`, but the project also documents self-hosted Docker and Cloudflare modes. The CVE case is strongest for any self-hosted/runtime configuration where server-side fetch can reach private network targets.

### Root Cause

The initial audit URL passes through `normalizeAndValidateStartUrl()`, which blocks private hosts and private DNS resolutions. However, discovery later performs fresh fetches using default redirect-following behavior:

```ts
const response = await fetch(`${origin}/robots.txt`, {
  headers: { "User-Agent": "OpenSEO-Audit/1.0" },
  signal: AbortSignal.timeout(10_000),
});
```

and:

```ts
const response = await fetch(normalizedSitemapUrl, {
  headers: { "User-Agent": "OpenSEO-Audit/1.0" },
  signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS),
});
```

Because redirects are followed by the runtime before application code receives the response, a redirect target can bypass the application's intended SSRF checks.

### Suggested Reproduction

1. Run OpenSEO in a self-hosted environment where server-side fetch can reach a local test service.
2. Run a local internal target, for example an HTTP server on `127.0.0.1:9000`.
3. Host an attacker-controlled site with:

```http
GET /robots.txt
HTTP/1.1 302 Found
Location: http://127.0.0.1:9000/private
```

or:

```http
GET /sitemap.xml
HTTP/1.1 302 Found
Location: http://127.0.0.1:9000/private
```

4. Start an OpenSEO audit against the attacker-controlled public origin.
5. Observe whether the internal target receives a request from the OpenSEO server.

Expected secure behavior: OpenSEO should not connect to the redirected private target. It should treat the discovery document as unavailable or blocked.

### Recommended Fix

Use manual redirect handling for discovery fetches and validate every redirect target before following it.

Recommended policy:

- Set `redirect: "manual"` on `robots.txt` and sitemap fetches.
- Resolve `Location` relative to the current URL.
- Reject non-HTTP(S), blocked hostnames, private IP literals, and private DNS resolutions.
- Keep sitemap fetches same-origin with the original crawl boundary.
- Cap redirect depth, for example one to three hops.
- Add tests that assert redirects to `127.0.0.1`, `localhost`, and `169.254.169.254` are not followed.

## Finding 2: Credit Metering Allows Concurrent Overspend

Severity: Medium
CWE: CWE-362, Race Condition
Affected component: Hosted DataForSEO billing/metering

### Affected Code

- `src/server/lib/dataforseo/client.ts`
  - `meterDataforseoCall()` checks available credits before the paid upstream call.
  - It charges only after the upstream DataForSEO call returns.
- `src/server/billing/subscription.ts`
  - `assertUsageCreditsAvailable()` only checks that the current monthly plus top-up balance is positive.

### Impact

Parallel requests can all pass the same positive balance check before any deduction is recorded. This allows an organization with a small remaining credit balance to trigger multiple paid DataForSEO calls and consume more upstream cost than their balance should allow.

This is likely a security/business-logic issue rather than a strong CVE candidate, because the affected boundary is hosted billing rather than arbitrary code execution or data exposure in distributed software.

### Recommended Fix

Use an atomic reservation model:

- Estimate or reserve a maximum cost before calling DataForSEO.
- Deduct/reserve credits atomically per organization.
- Execute the upstream call.
- Refund unused reservation after actual cost is known.
- Store idempotency keys for retries and workflow replays.

## Finding 3: Unbounded Discovery Document Reads Can Cause Workflow DoS

Severity: Low to Medium
CWE: CWE-400, Uncontrolled Resource Consumption
Affected component: Site audit crawler discovery

### Affected Code

- `src/server/lib/audit/discovery.ts`
  - `fetchRobotsTxtText()` reads `await response.text()`.
  - `fetchSitemapDocumentWithRetry()` reads `await response.text()`.

### Impact

A malicious audited site can serve very large `robots.txt` or sitemap XML responses. Since discovery reads the full body before parsing, this can consume excessive memory/CPU inside the Worker workflow.

The main page crawler already limits page HTML reads to 2 MiB, so discovery should follow the same pattern.

### Recommended Fix

- Replace `response.text()` in discovery with a bounded reader.
- Enforce maximum sizes for `robots.txt` and sitemap XML documents.
- Abort parsing once the cap is exceeded.
- Consider smaller caps for `robots.txt` than sitemap XML.

## Validation Performed

Dependencies were installed with Node.js 22.18.0 and pnpm 10.30.1 under `/tmp`.

Targeted tests passed:

- `src/server/lib/audit/url-policy.test.ts`
- `src/server/lib/scrape.test.ts`
- `src/server/lib/dataforseo/client.test.ts`
- `src/server/billing/subscription.test.ts`
- `src/server/mcp/tools/output-schema-validation.test.ts`
- `src/server/features/gsc/services/GscService.test.ts`

The existing tests cover direct start-URL blocking and the separate scrape helper's manual redirect behavior. They do not appear to cover redirect handling in `src/server/lib/audit/discovery.ts`.

## Disclosure Recommendation

Report Finding 1 privately to the maintainers first. If the project confirms the issue affects a released self-hosted version, request a CVE for the SSRF with affected version range, patch commit, and deployment caveats.

Findings 2 and 3 should be reported as hardening/security bugs. Finding 3 may be CVE-worthy if a proof of concept demonstrates practical denial of service against a supported self-hosted deployment
