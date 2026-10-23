---
name: observability-triage
description: Triage OpenSEO production errors in Cloudflare Workers Observability — verified query recipes, counting gotchas, a known-noise filter list applied automatically, and the on-demand CPU/heap profiling recipe. Use when asked to review Cloudflare logs/observability, count OOMs or worker errors, compare error rates between periods, investigate a prod error spike, or find where a worker spends CPU or memory (profiles, flamegraphs).
metadata:
  internal: true
---

# Observability triage

Query Cloudflare Workers Observability for prod errors, count them correctly, and skip the noise that has already been investigated to a dead end. Apply the known-noise list below without re-investigating those entries.

## Access

- Resolve the account at runtime — never hardcode it: the `cloudflare-api` MCP server pre-binds `accountId` in `mcp__cloudflare-api__execute`, and `npx wrangler whoami` prints it. The workers to triage are the ones this repo deploys (see `deploy/alchemy/alchemy.run.ts`): the main app worker plus the aux workers (audit engine, landing, self-host).
- Query via the `cloudflare-api` MCP server (`mcp__cloudflare-api__execute`). If its tools are absent, run its authenticate flow and give the user the URL — **wrangler's OAuth token gets a 403 on the observability API** (missing scope), so don't burn time on curl-with-wrangler-token.
- PostHog is the second error source but **cannot see** `exceededMemory` / `canceled` / `responseStreamDisconnected` outcomes — worker-outcome questions are answerable only here.

## Query recipes (verified shapes)

`POST /accounts/{account_id}/workers/observability/telemetry/query`. All of these are load-bearing; the API's 400s are opaque:

- `queryId: "adhoc"` is required. Timeframe is epoch **milliseconds**: `timeframe: { from, to }`.
- Count invocations by outcome:

  ```json
  {
    "queryId": "adhoc",
    "timeframe": { "from": 0, "to": 0 },
    "parameters": {
      "datasets": ["cloudflare-workers"],
      "filters": [
        { "key": "$metadata.type", "operation": "eq", "value": "cf-worker-event", "type": "string" }
      ],
      "calculations": [{ "operator": "count", "alias": "count" }],
      "groupBys": [
        { "value": "$workers.scriptName", "type": "string" },
        { "value": "$workers.outcome", "type": "string" }
      ],
      "limit": 100
    },
    "view": "calculations",
    "limit": 100
  }
  ```

- The `cf-worker-event` filter is what makes counts mean *invocations*; without it you count every log line.
- Raw samples: `view: "events"`, empty `calculations`/`groupBys`, small `limit`. Events carry `$metadata` (`service`, `trigger`, `level`, `message`, `fingerprint`, `requestId`) and `$workers` (`outcome`, `scriptName`, `scriptVersion`, `wallTimeMs`, `cpuTimeMs`, `eventType`).
- Error-level app logs grouped by message: filter `$metadata.level eq error`, groupBy `$metadata.message`.
- Verified filter operations: `eq`, `neq`. Percentiles: the API wants `"median"`, not `"p50"`. Filter for substrings client-side on fetched events.
- Useful drill-downs: groupBy `$metadata.trigger` (route), `$workers.scriptVersion` (did a deploy change the rate mid-window), `$workers.event.request.headers.user-agent`.

## Counting gotchas

- **Grouped results are unsorted and effectively capped (~10 rows returned regardless of `limit`).** A missing group ≠ zero. To see error outcomes, add `$workers.outcome neq ok` instead of hoping the error rows make the cut; sort client-side.
- **One isolate death fans out.** An OOM kills every request pinned to the isolate at the same instant — cluster raw OOM events by timestamp before reading the count as user impact.
- **Message prefixes fragment groups.** Logs with leading timestamps (better-auth's format) split one error into N single-count groups; grouped-by-message counts badly understate them. Sample events and merge client-side.
- **Prod deploys are manual** — main being fixed doesn't mean prod runs the fix. Check `$workers.scriptVersion` and the scripts' `modified_on` before concluding a fix didn't work.

## Profiling (CPU and heap flamegraphs)

Cloudflare captures an on-demand CPU or allocation profile from a live production isolate (shipped 2026-10-09). Reach for it only when the question is "where does the CPU or memory go", which logs and invocation metrics cannot answer; routine error triage never needs it. A capture only samples one already-running isolate for the requested window; keep windows at 10 to 15 s.

- Capture with the `cf` CLI (`npm i -g cf`, `cf login` once). It writes the pprof protobuf to stdout (the raw API response is gzipped; the reader below accepts both):

  ```
  cf workers versions profile latest --worker-id open-seo --duration-ms 10000 --profile-type cpu > open-seo-cpu.pprof
  cf workers versions profile latest --worker-id open-seo --duration-ms 15000 --profile-type heap > open-seo-heap.pprof
  ```

  API equivalent: `POST /accounts/{account_id}/workers/workers/{worker_id}/versions/latest/profile` with `{ "duration_ms": 10000, "profile_type": "cpu" }` (worker ids from `GET /accounts/{account_id}/workers/workers`). The dashboard shows the same capture as a flamegraph: Worker → Observability → Flamegraph view.
- Read it without Go: `node .agents/skills/observability-triage/scripts/pprof-top.mjs open-seo-cpu.pprof` prints the hottest self and inclusive frames. Google's `pprof` opens the file too.
- **It only samples an isolate that is already serving traffic**; nothing is started for you. The app worker always qualifies. The audit worker returns 0 samples unless an audit is running, so start one first. Idle preview and self-host workers fail with "The Worker has no loaded isolate in its recent execution locations" or "No recent executions were found".
- One capture is one isolate in one colo, chosen among the ones that ran recently, so repeat a capture before trusting a small frame. A 10 s CPU capture under normal load yields ~2,000 samples at 1 ms intervals.
- Function names are readable without source maps (the Vite build keeps them); file names are chunk hashes like `index-OuwxKDQa.js`. The deploy uploads no source maps (the build only emits them with `POSTHOG_SOURCEMAPS=true`), so chunk names stay hashes until that changes.
- A heap profile shows allocations made during the window (one stack per ~512 kB allocated), not retained memory: it finds churn, not leaks.
- Pair it with invocation data to see which route pays for the frames: group `cf-worker-event` by `$metadata.trigger` with `sum`, `median`, and `p90` of `$workers.cpuTimeMs`. A 10 s capture of one isolate weights whatever that isolate happened to serve, so convert a hot frame's share into milliseconds against the route's mean before acting on it: a frame at a third of a profile dominated by 2 ms auth failures is worth well under 1 ms per request.

## Known noise — filter these out, do not re-investigate

Entries land here only after an investigation proved there is **no first-party emit site to fix or demote**. Each keeps the one condition that would make it real signal again.

### 1. SAM chat Durable Object lifecycle (close code 1006)

- **Messages** (one phenomenon, counted three ways): `Connection closed: this Durable Object instance is no longer active. Reconnect or retry the request.` (hibernation/eviction), `Durable Object reset because its code was updated.` (deploy), plus the paired invocation summary whose `$metadata.error` is `close`.
- **Identify by**: `eventType: "hibernatableWebSocket"`, entrypoint `SamChatAgent`/`OnboardingChatAgent`, `webSocketType: "close", code: 1006, wasClean: false`, `outcome: "exception"`, single-digit `wallTimeMs`, `cpuTimeMs: 0`, no stack. Fingerprints `3aa4cac26653d09a0a41100a33d413ae` (exception), `0ae15457af49b4d9a117eeecf66b040a` (summary).
- **Why unfixable**: the DO is destroyed under the JS — its IoContext is already aborted when workerd delivers `webSocketClose`, so the first `await` never settles. `partyserver` already try/catches the whole close path; an `onClose` override would catch nothing.
- **Nothing breaks**: transcripts persist per message in DO SQLite, PartySocket reconnects unconditionally, and credit metering (`onChatResponse`) never fires on an aborted turn.
- **Real signal**: a sustained rise that does **not** correlate with a deploy (would mean mid-conversation evictions beyond hibernation).

### 2. `Network connection lost.`

- **Identify by**: fingerprint `be89d4ff7a64cb4d4dceae0f51cfe708`, or the message verbatim. Runtime-generated shape: `source.level` **absent**, `source.exception` **present**, `$metadata.origin: "fetch"` — the opposite of every app log (`source.level` present, no `exception`).
- **Why unfixable**: workerd's own record of a client disconnecting mid-stream; the exception never enters app code — the sibling request event for the same `requestId` has `outcome: "ok"`. No emit site exists; `wrangler.jsonc` observability config has no per-message filter. Do not add try/catch around the stream handlers (dead ceremony).
- **Real signal**: if the `/mcp` share of this group grows, treat it as a tool-call-latency symptom (clients timing out and cancelling) and route it to the /mcp performance track — not to this log group.

### Runtime-vs-app litmus test

Before investigating any unfamiliar error event: `source.level` absent + `source.exception` present ⇒ the Workers runtime wrote it, not the app. There is no call site to grep for; judge it by the sibling request's `outcome`.

## Adding an entry

Add to this list only after establishing there is no first-party emit site (grep the message; check the runtime-vs-app litmus above) and nothing is left in a wrong state. Every entry must include identify-by markers (fingerprint if stable) and its real-signal condition.
