# visualfusion OpenSEO Fork

This fork of [every-app/open-seo](https://github.com/every-app/open-seo) is maintained by visualfusion for internal production use and targeted improvements.

The goal is to stay as close to upstream `main` as possible while maintaining improvements in isolated feature branches so they can be contributed upstream as clean, reviewable pull requests.

---

## Patch Matrix

| Feature / Fix                          | Branch                                   | Upstream PR                                            |  Status   | Description                                                                                                                                                                                               |
| :------------------------------------- | :--------------------------------------- | :----------------------------------------------------- | :-------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit fallback for self-hosters**    | `fix/audit-rendering-fallback`           | [#448](https://github.com/every-app/open-seo/pull/448) |  🟡 Open  | Falls back to static HTML crawling when browser rendering infrastructure is unavailable instead of failing with `AUDIT_RENDERING_UNAVAILABLE`.                                                            |
| **SERP & feature matching**            | `fix/rank-tracking-serp-matching`        | [#449](https://github.com/every-app/open-seo/pull/449) |  🟡 Open  | Extracts domain from `item.url` and recognizes SERP features (e.g. Local Packs) during rank tracking checks.                                                                                              |
| **Multilingual word counting (CJK)**   | `fix/cjk-word-counting`                  | [#450](https://github.com/every-app/open-seo/pull/450) |  🟡 Open  | Uses `Intl.Segmenter` with word granularity for non-whitespace languages (Japanese, Chinese) to prevent false-positive `thin-content` warnings.                                                           |
| **Cloudflare email protection filter** | `fix/ignore-cloudflare-email-protection` | — _(Local)_                                            | 🟢 Active | Skips Cloudflare-obfuscated email links (`/cdn-cgi/l/email-protection`, `__cf_email__`) and `/cdn-cgi/*` edge paths during link extraction to prevent false-positive `broken-internal-link` (404) issues. |
| **German localization & client i18n**  | `feat/i18n-german`                       | — _(Local)_                                            | 🟢 Active | Lightweight reactive client i18n infrastructure with complete German localization for navigation, sidebar, dashboard, and all 30 site audit issue types.                                                  |

---

## Upstream Synchronization Workflow

To keep this fork synchronized with upstream:

```bash
# 1. Fetch latest changes from upstream
git fetch upstream

# 2. Update local main
git checkout main
git merge upstream/main

# 3. Rebase local feature branches if needed
git checkout fix/cjk-word-counting
git rebase upstream/main
```
