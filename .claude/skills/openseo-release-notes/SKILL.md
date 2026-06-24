---
name: openseo-release-notes
description: Cut an OpenSEO release — bump the version, draft user-facing release notes from commits since the last tag, run a review + subagent-verification pass, and open a "release: vX.X.X" PR. Use when the user asks to prepare a release, bump the version, or write release notes.
---

# OpenSEO release notes

Cut a release for this repo end to end. The deliverables are a version bump in `package.json`, a new `release-notes/v<version>.md`, and a PR against `origin/main` titled `release: v<version>`.

## 1. Bump the version

- Read `package.json`. If the branch has already bumped `version`, treat that as the source of truth and do not change it.
- Otherwise bump the patch version (e.g. `0.0.19` → `0.0.20`). Only bump minor/major if explicitly asked.

## 2. Collect the changes since the last release

- Find the latest tag: `git tag --sort=-creatordate | head -1`. Verify the branch is up to date with `origin/main` (`git fetch origin main && git log HEAD..origin/main --oneline` should be empty; flag it if not).
- List commits: `git log <last-tag>..HEAD --oneline`. You can also run `pnpm release:notes` for a generated skeleton.
- For each commit, fetch the PR body (`gh pr view <num> --json title,body`) — squash-commit subjects can be stale. Verify claims against the final code when a PR body and commit subject disagree (features get reverted before merge).

## 3. Draft the notes

Write `release-notes/v<version>.md` matching the style of the 2–3 most recent files in `release-notes/`:

- One-sentence summary line at the top (no heading). Lead with the biggest user-facing win, stated as the outcome.
- `## What's new`, `## Improved`, `## Fixed` — include a section only when it has content.
- Imperative bullets ("Add…", "Improve…", "Cut…"), concise, user-facing.
- **Be punchy — lead with the impact, not the mechanism.** The top-level bullet is the outcome the user gets ("Reduce rank tracking costs by ~3x"); push the how into one brief sub-bullet beneath it. Don't open a bullet with the implementation ("Run scheduled checks through DataForSEO's task queue and…") — that buries the lead.
- End with: `Full Changelog: https://github.com/every-app/open-seo/compare/v<prev>...v<version>`

Content guidelines:

- Only include changes to the **product itself** — the app, the MCP tools, the SEO data/features that someone running OpenSEO actually uses. The litmus test for every bullet: **would a self-hoster running OpenSEO care about this?** If it only affects the hosted commercial offering, the marketing site, or the first-run signup experience, drop it.
- Do NOT mention:
  - **Marketing-website (`web/`) changes** — landing pages, copy, positioning, blog.
  - **Pricing / plans / subscription / billing** — price changes, paywalls, free-trial changes, money-back guarantees, grandfathering, Autumn config, billing-status syncs. These are hosted-commercial concerns, irrelevant to self-hosters.
  - **Onboarding-flow-only changes** — the signup/onboarding chat, profiling steps, upgrade rails, email-verification UX, and other first-run-only flows. A change buried in onboarding is not a product capability the broader user base gains; leave it out even if it's a sizable feature.
  - **Hosted-app internals & meta** — directory/Smithery scores, analytics, specs/ADRs, CI, refactors.
- Include bug fixes and improvements when notable, user-facing, and not part of a larger refactor (fold minor fixes into the related bullet or drop them). A fix only qualifies if it changes behavior a user would notice in the product or MCP tools — not in onboarding or billing.
- Never invent features — every claim must trace to a commit. State user-visible limitations that set expectations (e.g. a feature unavailable for some countries).
- For headline numbers, quote the **conservative, typical figure**, not the cherry-picked best case. A PR's biggest number is often scoped to an ideal condition (e.g. "~83% cheaper for a page-1-ranking domain at default depth") — round down to a defensible blended claim ("~3x cheaper") so the headline never overstates the everyday result.
- Name specific MCP tools/params when an umbrella phrase would over- or understate which tools support a feature.

## 4. Review and verify

1. Spawn a reviewer subagent with: the draft, the guidelines above, the per-commit facts you gathered, and repo access. It returns numbered review comments citing which guideline each violates.
2. For each substantive comment, spawn a verification subagent (in parallel) that adversarially checks the comment against the actual commits/code and verdicts APPLY / APPLY-MODIFIED / REJECT.
3. Apply only verified comments.

## 5. Open the PR

- Commit the version bump, release notes, and any skill changes on a branch named `claude/v<version>` (use the current branch if it already follows this pattern).
- Push to `origin` and open a PR against `main` titled exactly `release: v<version>`. PR body: the release notes content.
- Do not tag or publish the GitHub release — that happens after merge. Suggest `gh release create v<version> --notes-file release-notes/v<version>.md` as the post-merge step.
