---
name: openseo-release-notes
description: 'Cut an OpenSEO release — bump the version, draft user-facing release notes from commits since the last tag, run a review + subagent-verification pass, and open a "release: vX.X.X" PR. Use when the user asks to prepare a release, bump the version, or write release notes.'
---

# OpenSEO release notes

Cut a release for this repo end to end. The deliverables are a version bump in `package.json`, a new `release-notes/v<version>.md`, and a PR against `origin/main` titled `release: v<version>`.

## 1. Bump the version

- Read `package.json`. If the branch has already bumped `version`, treat that as the source of truth and do not change it.
- Otherwise bump the patch version (e.g. `0.0.19` → `0.0.20`). Only bump minor/major if explicitly asked.

## 2. Collect the changes since the last release

- Find the latest tag: `git tag --sort=-creatordate | head -1`. Verify the branch is up to date with `origin/main` (`git fetch origin main && git log HEAD..origin/main --oneline` should be empty; flag it if not).
- List commits: `git log <last-tag>..HEAD --oneline`. You can also run `pnpm release:notes` for a raw commit inventory — use it only as a checklist of candidate changes, never as the draft's structure (its Improved/Changed/Docs sections must not appear in the notes).
- For each commit, fetch the PR body and author (`gh pr view <num> --repo <repo> --json title,body,author`) — squash-commit subjects can be stale. The `(#NN)` in commit subjects can reference **either** repo: try `bensenescu/open-seo` (origin) first and fall back to `every-app/open-seo` (public) — outside contributors' PRs and their handles live on the public repo. Commits with no `(#NN)` may still be an outside contribution with a public PR (`gh pr list --repo every-app/open-seo --state merged --author <login>`); check `git log --format=%an` for the author. Verify claims against the final code when a PR body and commit subject disagree (features get reverted before merge).
- Record the PR author's GitHub handle alongside each change so the bullet can credit them.

## 3. Draft the notes

Write `release-notes/v<version>.md`. **`release-notes/v0.0.24.md` is the canonical style exemplar** — match it (v0.0.25 and later follow the same style); v0.0.23 and earlier are the old verbose style, never imitate them. The notes are a scannable digest, not documentation: the whole file fits on one screen (roughly 15 lines including headings), and every line earns its place.

Format:

- Top line: a fragment naming the release's 2–3 highlights ("GSC UI, improved app layout and beta in app agent."). Not a "This release brings…" sentence.
- Sections: `## What's new` and `## Fixed` only. There is no "Improved" section — an improvement is either headline-worthy (What's new) or it's cut.
- **What's new bullets name the feature; they don't sell it.** One short line each ("Redesigned the app layout", "Get GSC Insights inside the app") — no em-dash feature tours, no "so you can…" benefit copy, no lists of everything the feature touches. If the name alone is ambiguous, one clause of plain-words context is the maximum.
- At most **one sub-bullet per feature**, one short line: the single most useful detail, a requirement ("Requires `OPENROUTER_API_KEY`"), or an expectation-setter.
- **Label rough features "(Beta)"** and set expectations honestly, including pointing at the better alternative for now. The expectation-setter rides the top-level line after a dash ("(Beta) In app agent - MCP is still recommended, but we'll be working to improve this during the summer."), keeping the sub-bullet slot free for a requirement or detail.
- Fixed: 3–5 bullets, one plain sentence each, only bugs a user plausibly hit and would recognize ("Claude answers in AI search work again."). No error codes, status codes, schema/infra vocabulary, or mechanism. If more than four qualify, keep the ones hit in core flows (searches, audits, tracking, MCP answers) and drop fixes for recovering self-inflicted state (re-adding, un-archiving, refreshing) first.
- **Credit the contributor.** End the bullet with `— thanks @handle` for outside contributors only — never for the maintainer's own PRs (`bensenescu`). Credit goes on the top-level bullet, not sub-bullets. Multiple contributors: `— thanks @a, @b`.
- End with: `Full Changelog: https://github.com/every-app/open-seo/compare/v<prev>...v<version>`

Curation — this is where the work is. Cut aggressively; the Full Changelog link covers the long tail:

- Only changes to the **product itself** — the app, the MCP tools, the SEO data/features someone running OpenSEO actually uses. Litmus test per bullet: **would a self-hoster notice this while using the product?** Caring in the abstract (a new backend option, a raised cap) is not enough.
- Do NOT mention:
  - **Marketing-website (`web/`) changes** — landing pages, copy, positioning, blog.
  - **Pricing / plans / subscription / billing** — paywalls, free-trial/plan changes, Autumn config. Hosted-commercial concerns, irrelevant to self-hosters.
  - **Onboarding-flow-only changes** — signup/onboarding chat, profiling steps, upgrade rails, email-verification UX. Not a product capability, even when sizable.
  - **Hosted-app internals & meta** — analytics, specs/ADRs, CI, refactors, dependency bumps.
  - **Invisible-to-the-user work, even when product-relevant** — security hardening, raised caps/limits, stability/memory/perf fixes, database/backend options and migrations. A user reading the notes should recognize every line from using the product; if they'd only notice it in a config file or an incident that no longer happens, cut it.
- When torn between including and cutting, cut. A 4-bullet What's new that gets read beats a 10-bullet one that doesn't.
- Never invent features — every claim must trace to a commit.
- Numbers in bullets are usually selling — cut them; if one is genuinely load-bearing, quote the conservative, typical figure, never a cherry-picked best case.

## 4. Review and verify

1. Spawn a reviewer subagent with: the draft, the guidelines above, the per-commit facts you gathered, and repo access. It returns numbered review comments citing which guideline each violates. Its charge includes **verbosity**: flag any bullet that sells instead of names, any second sub-bullet, any Fixed bullet with mechanism vocabulary, and anything that pushes the file past one screen.
2. For each substantive comment, spawn a verification subagent (in parallel) that adversarially checks the comment against the actual commits/code and verdicts APPLY / APPLY-MODIFIED / REJECT.
3. Apply only verified comments.

## 5. Open the PR

- Commit the version bump, release notes, and any skill changes on a branch named `claude/v<version>` (use the current branch if it already follows this pattern).
- Push to `origin` and open a PR against `main` titled exactly `release: v<version>`. PR body: the release notes content.
- Do not tag or publish the GitHub release — that happens after merge. After merge, run `pnpm release:publish`. It reads the version from `package.json` and publishes the matching `release-notes/v<version>.md` to `every-app/open-seo`.
- The equivalent command is:

  ```sh
  gh release create v<version> \
    --repo every-app/open-seo \
    --title v<version> \
    --notes-file release-notes/v<version>.md
  ```
