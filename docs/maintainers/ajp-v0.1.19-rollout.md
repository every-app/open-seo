# AJP v0.1.19 rollout and rollback

Publication plan and **deployment record** for the v0.1.19 integration (PR #22).

## Merge commit

- **PR:** https://github.com/alljigsawpuzzles/open-seo/pull/22 (**merged** 2026-10-27)
- **Merge commit:** **`083904674f8b17fa5b2662ffe507c8b39e73eca9`**
- **Build validated on droplet at:** `b58deab3` / merge SHA — `release-build-validation.json` (2026-10-27)

## Deployment record (2026-10-27)

| Item                           | Value                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Publication artifact (private) | `/home/geoffajp/openseo-release-review/v0.1.19-publication-2026-10-27T12-06-37-641Z` |
| Handover summary               | `/home/geoffajp/openseo-handover/2026-10-27/DEPLOYMENT-v0.1.19.md`                   |
| D1 `d1_migrations` rows        | **62**                                                                               |
| Latest applied                 | `0062_bind_api_keys_to_organization.sql` (ledger id `00063`)                         |
| **0055**                       | **Not** in ledger (deliberately skipped)                                             |
| App Worker @ 100%              | `5a156ab3-4966-45fa-9833-71cb096d3687`                                               |
| Audit Worker @ 100%            | `62a59c17-1f7f-4fbf-b68b-cd5a9da8953e`                                               |
| `AUTH_MODE`                    | `cloudflare_access`                                                                  |
| App cron schedules             | `17 3 * * *`, `*/5 * * * *` (restored after cutover)                                 |

### Smoke results

| Check                                                                         | Result                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflows idle / nonterminal audits at cutover                                | Pass                                                                                                                                       |
| Pre-migrate backup export + restore verify                                    | Pass                                                                                                                                       |
| Migrations 0060–62 only; row counts unchanged                                 | Pass                                                                                                                                       |
| Unauthenticated protected routes                                              | 401                                                                                                                                        |
| Public `/about/`, `/privacy`                                                  | 200                                                                                                                                        |
| **Authenticated Access + existing-data screens** (operator Geoff, 2026-10-27) | **Pass — no errors reported** (GSC/GA4, rank history, audit history, AI staff paths without OpenRouter gate, paused AI tracking unchanged) |

No paid provider jobs were run during publication or operator smoke.

### Unresolved follow-ups (separate from this release)

- **Shopify signature** save/reliability and signed-crawl root cause — see `ajp-v0.1.19-compatibility.md` §1.
- **Rank check** progress-at-100%-during-retries, self-host cost estimate, alert banners — see Oct 2026 `FINDINGS.md`; not fixed by v0.1.15–19 alone.

## Pre-deploy baseline (2026-10-27 morning)

| Item                    | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| D1 `d1_migrations` rows | **59**                                                           |
| Latest applied          | `0059_thankful_aaron_stack.sql` (ledger id `00060`)              |
| **0055**                | **Not** in ledger (gap at id `00056`; 0055 deliberately skipped) |
| App Worker @ 100%       | `f4575d03-0bcc-4f2b-85e6-839e9be847ec` (v0.1.14 / `ff093c2f`)    |
| Audit Worker @ 100%     | `cbe1faa7-9c3c-4c41-8956-2c7dd8db7056`                           |

## Migration delta (only)

Apply **nothing** via generic `db:migrate:prod`, `deploy:selfhost`, or Alchemy migrate.

| Order | File                                     | Ledger id after apply |
| ----- | ---------------------------------------- | --------------------- |
| 1     | `0060_reflective_wrecker.sql`            | `00061`               |
| 2     | `0061_bumpy_fat_cobra.sql`               | `00062`               |
| 3     | `0062_bind_api_keys_to_organization.sql` | `00063`               |

**Excluded:** `0055_chief_centennial.sql` and every migration already on the live ledger.

Prepared SQL bundle (private): `/home/geoffajp/openseo-release-review/v0.1.19/migration-0060-0062.sql` and `migration-delta-manifest.json`.

Rehearsed against a **fresh remote D1 export** (2026-10-27): 0060–0062 only; integrity OK; FK OK; ledger 59 → 62.

**0062 note:** updates `apikey.metadata` for organization binding. Treat as data change; rollback needs export restore if incompatible.

## Pre-publication preparation (done without disruption)

| Artifact                           | Location                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1 SQL export                      | `openseo-release-review/v0.1.19/pre-publication/production-20261027T104412Z.sql` (SHA256 recorded privately) |
| Worker settings + script snapshots | `openseo-deploy/backups/2026-10-27T10-44-25-050Z/`                                                           |
| Candidate build + dry-runs         | `openseo-release-review/v0.1.19/release-build-validation.json`                                               |

**D1 export:** Cloudflare may briefly pause queries during export; no schema changes were made.

## Publication sequence (after merge + approval)

1. **Recheck** active Workflow instances (site audit, rank check, AI visibility). Do not pause schedules or terminate jobs until this pass is complete and Geoff approves.
2. **Pause** app cron triggers (`17 3 * * *`, `*/5 * * * *`); record exact schedule objects for restore.
3. **Wait** for running jobs to finish (or document explicit exceptions).
4. **Fresh export** again immediately before migrate (post-upgrade writes since today’s export must be preserved or consciously discarded).
5. **Apply** `migration-0060-0062.sql` via explicit `wrangler d1 execute` (or equivalent allowlisted steps), one file at a time, verifying ledger after each.
6. **Build** from merged SHA with `AUTH_MODE=cloudflare_access` and production client env (same method as v0.1.14 validation).
7. **Upload** inactive app + audit candidates; compare bindings/runtime to `openseo-deploy/backups/.../summary.json` and live API read.
8. **Activate** both Workers together at 100% (matching pair).
9. **Smoke:** Access on private routes; public `/about/`, `/privacy`, Google verification file; GSC/GA4; rank keywords; audit history; **AI visibility / Prompt Research / Prompt Explorer without OpenRouter** (must not show OpenRouter gate — see `ajp-v0.1.19-compatibility.md`); paused AI tracking unchanged.
10. **Restore** cron schedules exactly as recorded in step 2.

## Expected interruption

| Phase                | User impact                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| Queue drain          | None if no active long jobs                                                            |
| D1 migrate (0060–62) | Short windows per SQL file; new tables only until features used; 0062 touches API keys |
| Worker cutover       | Seconds–minutes; in-flight HTTP may fail once; workflows rely on durable replay        |
| Cron pause           | Scheduled rank/AI admissions delayed until restore                                     |

No auth mode change, secret rotation, or Shopify rule edits in this plan.

## Rollback

**Workers (code only):** reactivate previous versions **together**: app `f4575d03-0bcc-4f2b-85e6-839e9be847ec`, audit `cbe1faa7-9c3c-4c41-8956-2c7dd8db7056`. Restore cron schedules from backup JSON.

**Database:** if 0060–62 applied, prefer **restore D1 from pre-migrate export** if anything breaks. Additive schema (local rank tables, signup campaigns) can remain under v0.1.14 code if you roll Workers back without DB restore—only if no dependency on new code paths. **0055** remains excluded on any restore path that replays migrations.

**Post-upgrade writes:** if users changed data after the pre-migrate export, a full restore loses those writes; take the final export immediately before migrate and accept that rollback trades availability for that window.

## Validation already completed (droplet)

- **`b58deab3`:** `pnpm ci:check` (6144 MB heap), selfhost build with **`AUTH_MODE=cloudflare_access`** from production binding snapshot (preview `.env.local` removed), both Worker dry-runs — `/home/geoffajp/openseo-release-review/v0.1.19/release-build-validation.json`
- Vitest **1852** @ `29c83fb4` (gate fix); not gated by `ci:check`
- GitHub Actions CI **not run** on PR #22 — Actions disabled on repo

## Compatibility review (2026-10-27)

Fork vs upstream `v0.1.19` for Shopify crawl, HTML/render fallback, rank-check UX/cost, and DataForSEO-only AI: **`docs/maintainers/ajp-v0.1.19-compatibility.md`**.

**PR #22 addition:** `OpenRouterKeyGate` bypass when `generationAvailable === false` (restores staff DataForSEO-only workflows blocked by upstream v0.1.18). Local `pnpm dev` without Cloudflare Access env does not exercise the full UI; post-deploy smoke on the real self-host is required.
