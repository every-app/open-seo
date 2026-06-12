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

- One-sentence summary line at the top (no heading).
- `## What's new`, `## Improved`, `## Fixed` — include a section only when it has content.
- Imperative bullets ("Add…", "Improve…", "Cut…"), concise, user-facing.
- End with: `Full Changelog: https://github.com/every-app/open-seo/compare/v<prev>...v<version>`

Content guidelines:

- Only include changes relevant to users of the product (hosted users and self-hosters).
- Do NOT mention: marketing-website (`web/`) changes, hosted-app internals (billing infrastructure, Autumn config, directory/Smithery scores, analytics), specs/ADRs, CI, refactors.
- Include bug fixes and improvements when notable and not part of a larger refactor (fold minor fixes into the related bullet or drop them).
- Never invent features — every claim must trace to a commit. State user-visible limitations that set expectations (e.g. a feature unavailable for some countries).
- Name specific MCP tools/params when an umbrella phrase would over- or understate which tools support a feature.

## 4. Review and verify

1. Spawn a reviewer subagent with: the draft, the guidelines above, the per-commit facts you gathered, and repo access. It returns numbered review comments citing which guideline each violates.
2. For each substantive comment, spawn a verification subagent (in parallel) that adversarially checks the comment against the actual commits/code and verdicts APPLY / APPLY-MODIFIED / REJECT.
3. Apply only verified comments.

## 5. Open the PR

- Commit the version bump, release notes, and any skill changes on a branch named `claude/v<version>` (use the current branch if it already follows this pattern).
- Push to `origin` and open a PR against `main` titled exactly `release: v<version>`. PR body: the release notes content.
- Do not tag or publish the GitHub release — that happens after merge. Suggest `gh release create v<version> --notes-file release-notes/v<version>.md` as the post-merge step.
