# AJP deployment log (in-app changelog)

Staff see **Settings → Deployment log** (`/settings/changelog`) on self-host builds (not OpenSEO Cloud).

## Source of truth

Edit **`src/shared/ajp-deployment-changelog.ts`** when you deploy or merge upstream.

| Field               | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `version`           | Must match `package.json` after the deploy                                                                 |
| `upstream.sections` | Summaries from [every-app/open-seo releases](https://github.com/every-app/open-seo/releases) we integrated |
| `forkChanges`       | Anything AJP-specific (auth, migrations skipped, gate bypass, crawler, public pages, ops)                  |
| `operations`        | D1 allowlist, Worker pairs, schedules — no secrets                                                         |
| `openFollowUps`     | Known issues **not** fixed by this deploy (keep separate from release bullets)                             |

The **Personal → About** version label reads `package.json` only. That is the upstream OpenSEO semver we integrated, not a fork-only number.

## Checklist on each production deploy

1. Bump `package.json` to the integrated upstream version (if not already).
2. Prepend a new entry to `AJP_DEPLOYMENT_CHANGELOG` (newest first).
3. Record PR merge commit, migration allowlist, and fork deltas.
4. Copy open follow-ups forward until closed (Shopify signatures, rank UX/cost, etc.).
5. Update `docs/maintainers/ajp-upstream-integration.md` and handover `DEPLOYMENT-v*.md` as today.

## Next integration

**Shipped:** **v0.1.24** on **2026-11-04** (PR **#27**, merge **`6db472cc`**, D1 **0063**, **`publish-v24.mjs`**).

**Watch:** upstream **v0.1.25+** on [every-app/open-seo releases](https://github.com/every-app/open-seo/releases).

**In flight (not prod):** rank notification webhooks on branch **`codex/notifications-wip`** (`0146ebc7`) — re-apply on **`main`** with migrations **0064/0042** before deploy.
