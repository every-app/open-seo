# Codebase audit backlog (September 2026)

Findings from the fork-time audit (security, correctness, performance,
maintainability) that were verified but intentionally not changed in the same
pass, because each alters behaviour, billing semantics or public contracts and
deserves its own change with a test. Ordered by value. Everything the audit
found that was low-risk has already been applied.

## Billing and spend

1. **Credit gate has no cost reservation.** `assertUsageCreditsAvailable`
   only checks that the combined balance is above zero, and each metered call
   bills after the provider returns. Concurrent calls (the MCP limiter allows
   thousands per minute) can all pass with one credit left, and parallel
   batches deduct from a stale monthly snapshot, so the monthly balance goes
   negative while top-ups stay untouched. Rank checks already estimate first
   (`maxCostCredits`); do the same for research, backlinks and SERP paths, and
   decrement a shared per-batch remaining value as `SamChatAgent.meterSpend`
   does. Files: `src/server/billing/subscription.ts`,
   `src/server/lib/dataforseo/client.ts`, `src/server/workflows/rankCheckPaths.ts`.
2. **Metering failure after a successful paid call fails the request.** If
   the second Autumn track call fails, the caller sees an error although the
   provider data was returned and paid for, and a retry pays again. Catch
   metering errors after the provider call succeeded, log a metering-debt
   event, and return the data. File: `src/server/billing/subscription.ts`.
3. **Live rank checks post one task per request.** The live SERP endpoint
   accepts up to 100 tasks per POST; the manual path posts one per keyword and
   device and meters each separately (roughly four Autumn round trips per
   keyword). Batch the tasks and meter once per batch. Files:
   `src/server/workflows/rankCheckPaths.ts`, `src/server/lib/dataforseo/serp.ts`.
4. **Retries on other billed POSTs.** Rank-check live calls and task posts no
   longer retry on 5xx. Labs, backlinks and AI endpoints still do; decide per
   endpoint whether a replay after a provider edge error is acceptable.

## Performance

5. **Latest-snapshot query scans a config's whole history.**
   `getSnapshotsForConfig` groups over every completed run with no date bound
   and runs twice per results view and up to five times per dashboard load.
   Restrict to the last one or two completed runs. File:
   `src/server/features/rank-tracking/repositories/snapshotQueries.ts`.
6. **Audit results load every wide row.** `getAuditResultsForProject`
   selects all columns of pages, issues and Lighthouse rows with no limit; a
   10k-page audit is tens of megabytes in the main Worker. Select the narrow
   column set used elsewhere and cap or paginate issues. File:
   `src/server/features/audit/repositories/AuditRepository.ts`.
7. **Saved-keyword metric refresh has no cap.** One click can trigger dozens
   of metered calls for a project with tens of thousands of saved keywords.
   File: `src/server/features/keywords/services/refresh-metrics.ts`.
8. **Audit status polling hits the Workflows control plane every tick.**
   Reconcile only when the row is older than the grace period.
   Files: `src/server/features/audit/services/AuditService.ts`,
   `src/routes/_project/p/$projectId/audit/index.tsx`.
9. **Multi-row inserts.** `executeInBatches` issues one statement per item;
   snapshot and issue inserts could pack rows per statement under the bind cap.
   File: `src/db/runBatch.ts`.
10. **Recharts in the dashboard's first paint.** Lazy-load the chart
    components. Files: `src/client/features/dashboard/Ga4Card.tsx`,
    `src/client/features/keywords/components/DisplayPrimitives.tsx`,
    `src/client/features/rank-tracking/RankTrackingOverview.tsx`.

## Security hardening (no critical or high findings)

11. **SSRF guard is resolve-then-fetch.** The crawler resolves the start host
    once over DoH, fails open on DoH errors, and later fetches by hostname, so
    DNS rebinding can reach private addresses on Docker self-hosts (the
    Workers runtime blocks private fetches on Cloudflare). Fail closed on DoH
    errors and document egress filtering for self-host. File:
    `src/server/lib/audit/url-policy.ts`.
12. **Forwarded headers trusted on plain-HTTP self-host.** The public origin
    is rebuilt from `X-Forwarded-Host`/`Proto` when the request is HTTP, which
    lets a caller poison generated links behind a permissive proxy. Prefer a
    configured origin and fall back to headers only when unset. File:
    `src/server/mcp/public-origin.ts`.

## Maintainability

13. **Formatting helpers have drifted.** Four `formatNumber` copies with three
    behaviours and five date formatters with differing locale and null
    handling under `src/client/features/**`. Consolidate next to
    `src/client/lib/relative-time.ts`; the output changes slightly, so review
    the affected screens.
14. **Two server functions bypass the service layer.**
    `src/serverFunctions/ahrefs.ts` owns fetch, cache and batching inline;
    `src/serverFunctions/onboarding.ts` queries the database directly. Move
    into a service and repository respectively.
15. **`SerpLocationCombobox` fetches outside TanStack Query** with a manual
    debounce and cancellation flags; a `useQuery` with `keepPreviousData`
    removes the race. File: `src/client/components/SerpLocationCombobox.tsx`.
16. **Oversized MCP tool modules.** The local-business tools in
    `dataforseo-research-tools.ts` and the rank-grid block in
    `local-seo-tools.ts` are self-contained and can move to their own files.
17. **Postgres timestamp comparisons.** Snapshot queries compare ISO
    `checked_at` against SQLite-format cutoffs; it works by string ordering but
    widens the window to the start of the cutoff day on Postgres. Mirror the
    provider branch used in `auditReconciler.ts`.

## Dependencies

`pnpm audit --prod` reports no known vulnerabilities. Outdated packages are
minor or patch bumps (Better Auth 1.7, TanStack patch releases, PostHog,
daisyUI, oxlint); upgrade in a dedicated change with the full test suite.
