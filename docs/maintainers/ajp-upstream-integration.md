# AJP upstream integration status

Secret-free progress record for the self-hosted fork. Private operational detail stays under `/home/geoffajp/openseo-handover/`.

## Verified baseline (2026-10-27)

| Item                                     | Value                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Last deployed integration**            | **v0.1.20** (PR #24); **v0.1.24** in PR [#27](https://github.com/alljigsawpuzzles/open-seo/pull/27) — not yet prod |
| Previous production                      | v0.1.14 (PR #21), `ff093c2f`                                                                                       |
| Fork `origin/main`                       | **`083904674f8b17fa5b2662ffe507c8b39e73eca9`**                                                                     |
| Stale checkout (do not use for upgrades) | `/home/geoffajp/dev/open-seo` @ `3564a19f` (`codex/droplet-development`)                                           |
| Integration worktree                     | `/home/geoffajp/dev/open-seo-v0.1.19` @ merge commit                                                               |
| Merged PR                                | https://github.com/alljigsawpuzzles/open-seo/pull/22                                                               |
| Upstream integrated tag                  | `v0.1.19` → `99d9a49c`                                                                                             |
| Upstream v0.1.14 tag                     | `8713d753` (merge-base with fork)                                                                                  |
| Commits upstream v0.1.14…v0.1.19         | 60 on linear release ancestry                                                                                      |
| Production smoke (operator)              | Pass 2026-10-27 — see `ajp-v0.1.19-rollout.md` deployment record                                                   |

## Release scope (verified tags)

| Release | Tag SHA    | Notes for AJP fork                                                                                  |
| ------- | ---------- | --------------------------------------------------------------------------------------------------- |
| v0.1.15 | `0ca244b0` | MCP OAuth/org binding, rank recheck for never-ranked keywords, MCP sign-in refresh                  |
| v0.1.16 | `236761ad` | **Shopify crawl continues past refused URLs**; dashboard scan without renderer; workflow resilience |
| v0.1.17 | `307c9ec6` | **AUTH_MODE=password**, standalone Docker, team/org schema (keep **cloudflare_access** in prod)     |
| v0.1.18 | `89ad06cf` | **OpenRouter gate** for AI visibility setup; Every App auth mode (not used on AJP)                  |
| v0.1.19 | `99d9a49c` | Rendered-audit **>1k pages within one credit hold**; MCP rank keyword volume                        |
| v0.1.20 | `f24a8334` | Colorblind charts; AI visibility late-answer + MCP routing fixes; rank “double-checking” copy       |

## New migrations after production (post–v0.1.14)

SQLite journal adds **0060**, **0061**, **0062** (Postgres **0038–0040**). **0055 remains intentionally skipped** on AJP production; do not run generic `migrate` without an explicit allowlist. Rehearse 0060–0062 on a private restored backup before any prod apply.

## Merge conflict resolution (fork-specific)

Resolved eight conflict regions by combining upstream v0.1.16–v0.19 crawler/auth improvements with fork behavior:

- **Crawler:** `auditRequestHeaders` / `publicFetch`, upstream rate-limit pacing and Shopify `refuse`, plus fork fetch diagnostics and render HTML fallback.
- **AI prompt research:** retained DataForSEO-only path when `OPENROUTER_API_KEY` is unset on self-host.
- **Workflow:** both `renderHold` (metered rendered audits) and per-audit `diagnostics`.

## Material risks (unchanged constraints)

1. **Auth:** v0.1.17 adds password/standalone paths; production must stay `cloudflare_access` until an explicit product decision.
2. **OpenRouter:** v0.1.18 gate blocked DataForSEO-only UI; PR adds **bypass** when `generationAvailable === false`. Server manual research + `aiPromptResearchFallback` retained from fork.
3. **Migrations:** 0055 skip + non-contiguous ledger; plan 0060–0062 explicitly.
4. **Shopify signature:** save/re-encrypt still open; do not rotate secrets during integration testing.
5. **Rank check:** upstream changes may help retries/UI; Oct 20 cost/queue findings are not automatically fixed—re-read code, no new paid runs without approval.
6. **GitHub CI:** Actions are **disabled** on `alljigsawpuzzles/open-seo` (workflow dispatch returns HTTP 422). PR #22 shows no checks because nothing runs—not because checks failed. Droplet validation is the current gate unless Actions is re-enabled.
7. **AI visibility UI:** see `ajp-v0.1.19-compatibility.md` §4 and acceptance checklist. Gate bypass + Vitest added; production smoke without OpenRouter still required.

## Validation (droplet, 2026-10-27)

**Publication prep revision:** `b58deab3574c1eea981be80ce5ce13b6a02b9f40`

| Check                                | Result                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm ci:check`                      | **Passed** @ `b58deab3` (`NODE_OPTIONS='--max-old-space-size=6144'`)                        |
| Vitest                               | **1852** @ `29c83fb4` (not part of `ci:check`; rerun optional before deploy)                |
| Selfhost build (`cloudflare_access`) | **Passed** @ `b58deab3` via `prepare-v19-build.mjs` (no `.env.local`; prod `AUTH_MODE` env) |
| Wrangler dry-run                     | **Passed** — app **43** bindings, audit **18** (see `release-build-validation.json`)        |
| Auth bake-in                         | Client references `cloudflare_access`; `local_noauth` only in shared auth-mode enum strings |
| Migration rehearsal                  | **0060–0062** on live export copy; **0055** excluded (ledger rehearsal unchanged)           |

Private artifact: `/home/geoffajp/openseo-release-review/v0.1.19/release-build-validation.json`

Preview-only env (not used for build): `/home/geoffajp/openseo-handover/2026-10-27-preview.env.local.bak`

| v0.1.24 | `0c04886f` | Prompt Tracking branded filter + competitors; integrates 0.1.21–0.23 scope — PR **#27** pending deploy |

## Next steps

1. Merge PR **#27** after droplet **`pnpm ci:check`** and operator smoke; deploy Workers + allowlisted **0063**.
2. Re-apply **`codex/notifications-wip`** on updated **main** (migrations **0064/0042**).
3. Monitor production; Shopify signature and rank-cost follow-ups unchanged.

## Deployment state

**Live** on Cloudflare @ merge `08390467` (2026-10-27). Private publication bundle and operator notes under `openseo-handover/2026-10-27/DEPLOYMENT-v0.1.19.md`.
