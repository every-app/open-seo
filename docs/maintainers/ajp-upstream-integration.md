# AJP upstream integration status

Secret-free progress record for the self-hosted fork. Private operational detail stays under `/home/geoffajp/openseo-handover/`.

## Verified baseline (2026-11-04)

| Item                          | Value                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Last deployed integration** | **v0.1.24** (PR [#27](https://github.com/alljigsawpuzzles/open-seo/pull/27)), merge **`6db472cc`**      |
| Previous production           | v0.1.20 (PR #24), 2026-10-29                                                                            |
| Fork `origin/main`            | **`6db472ccaa34e323170d8ed94a45e516f422496b`** @ OpenSEO **0.1.24**                                     |
| D1 ledger                     | **63** rows; latest **`0063_account_deletion_requests.sql`**; **0055** still skipped                    |
| Live Workers @ 100%           | app **`551da5fd-…`**, audit **`ace9519b-…`** (see private `v0.1.24-publication-*` JSON)                 |
| Publication scripts           | `~/openseo-release-review/prepare-v19-build.mjs`, **`apply-migration-0063.mjs`**, **`publish-v24.mjs`** |
| Canonical dev                 | **`~/dev/open-seo`** on droplet **`134.209.21.186`** only                                               |

## Release scope (verified tags — AJP deploy history)

| Release | Tag SHA    | Notes for AJP fork                                                                                                              |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| v0.1.15 | `0ca244b0` | MCP OAuth/org binding, rank recheck for never-ranked keywords, MCP sign-in refresh                                              |
| v0.1.16 | `236761ad` | **Shopify crawl continues past refused URLs**; dashboard scan without renderer; workflow resilience                             |
| v0.1.17 | `307c9ec6` | **AUTH_MODE=password**, standalone Docker, team/org schema (keep **cloudflare_access** in prod)                                 |
| v0.1.18 | `89ad06cf` | **OpenRouter gate** for AI visibility setup; Every App auth mode (not used on AJP)                                              |
| v0.1.19 | `99d9a49c` | Rendered-audit **>1k pages within one credit hold**; MCP rank keyword volume                                                    |
| v0.1.20 | `f24a8334` | Colorblind charts; AI visibility late-answer + MCP routing fixes; rank “double-checking” copy                                   |
| v0.1.24 | `0c04886f` | Integrates upstream **0.1.21–0.1.24** (Local SEO beta, rank/MCP fixes, **0063**, Prompt Tracking filters) — **live 2026-11-04** |

Intermediate tags **0.1.21–0.1.23** shipped in the single **0.1.24** integration; see staff changelog and [compare v0.1.20…v0.1.24](https://github.com/every-app/open-seo/compare/v0.1.20...v0.1.24).

## New migrations after production (post–v0.1.14)

SQLite journal through **0063** on production (**0060–0062** in v0.1.19 deploy; **0063** in v0.1.24). Postgres **0041** equivalent for hosted/Postgres paths. **0055 remains intentionally skipped**; do not run generic `migrate` without an explicit allowlist.

## Merge conflict resolution (fork-specific)

Same patterns as v0.1.19–20: crawler diagnostics + upstream Shopify/refuse; **OpenRouterKeyGate** bypass + DataForSEO-only research; Settings deployment changelog on self-host. v0.1.24 merge touched audit shared date exports, **`SiteAuditWorkflow`** + **`yieldingStep`**, crawl helper tests (403 non-HTML render).

## Material risks (unchanged constraints)

1. **Auth:** production stays **`cloudflare_access`**.
2. **OpenRouter:** gate bypass when `generationAvailable === false`; manual research paths retained.
3. **Migrations:** 0055 skip + allowlisted apply only.
4. **Shopify signature:** save/re-encrypt still open.
5. **Rank check:** cost/alert UX — notification webhooks in progress on **`codex/notifications-wip`** (not prod).
6. **GitHub CI:** disabled on fork; droplet **`pnpm ci:check`** / **`pnpm test:ci`** remain the gate (oxlint may OOM on 8GB — same as v0.1.19 notes).

## Next steps

1. Watch **[every-app/open-seo releases](https://github.com/every-app/open-seo/releases)** for **v0.1.25+**.
2. Finish **rank notification webhooks** on **`codex/notifications-wip`** → renumber **0064/0042** on **`main`**, then upstream PR if desired.
3. Optional: private handover note **`DEPLOYMENT-v0.1.24.md`** (publication dir, rollback Worker IDs, smoke notes).
4. Optional: delete merged remote branch **`codex/upgrade-openseo-v0.1.24`**.

## Deployment state

**Live** on Cloudflare @ **`6db472cc`** (2026-11-04). Private publication: `~/openseo-release-review/v0.1.24-publication-2026-11-04T14-33-55-147Z/publication.json`.

Historical v0.1.19 record: `docs/maintainers/ajp-v0.1.19-rollout.md`, `openseo-handover/2026-10-27/DEPLOYMENT-v0.1.19.md`.
