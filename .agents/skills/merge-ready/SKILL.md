---
name: merge-ready
description: Take a branch from "code exists (or is about to)" to "ready for Ben's final review" — multi-axis subagent review with verified findings, fixes, ci:check, checkpoint commits, and an updated PR. Use whenever the user says a feature/fix/branch should be "merge ready", asks to get changes ready for review, or appends this to a build request ("build X and make it merge-ready").
---

# Merge ready

Drive the current work to the point where the only remaining step is Ben's own review and merge. The deliverable is a pushed branch with a clean `pnpm ci:check`, checkpoint commits along the way, and an open PR with a high-level description plus review instructions.

**Never merge the PR. Ben always reviews last.**

## 0. Figure out the starting point

This skill composes with feature work — it is not only a review pass:

- **Invoked alongside a build request** ("build X, make it merge-ready"): implement the feature/fix first, committing as you go, then continue below. The review phases cover _all_ changes on the branch vs `origin/main`, not just the last edit.
- **Invoked on existing work** ("make this branch merge-ready"): start directly at step 1. The scope is `git diff origin/main...HEAD` plus anything uncommitted.

## 1. Sync with main

- `git fetch origin main`. If the branch is behind, merge `origin/main` in and resolve conflicts (favor main's version for code this branch didn't intentionally change).
- **Checkpoint:** commit the merge before starting review, so conflict resolution is auditable separately from review fixes.

## 2. Multi-axis subagent review

Spawn independent review subagents **in parallel**, one per axis, each given the branch diff scope (`git diff origin/main...HEAD`) and repo access:

1. **Unnecessary complexity** — thin wrappers, needless indirection, single-use abstractions, defensive guards for impossible states, dead config. This codebase deliberately stays simple.
2. **Security** — authz on new endpoints (org/project scoping), SSRF, injection, secrets handling, anything user-input-shaped reaching D1/R2/external APIs.
3. **Billing & metering** — ways a user could trigger DataForSEO/provider spend without being metered, charged-but-failed paths, retry/loop amplification, endpoints with unexpectedly high per-call user cost. Credits are billed via Autumn; uncounted spend is a revenue leak.
4. **Library & project idioms** — TanStack (Router/Query/Start) used idiomatically; patterns match how the rest of the codebase already does it (Result-pattern error handling at provider seams, db/schema conventions, existing component patterns). Flag novel patterns where an established one exists.
5. **Vibe-coded cruft** — leftover scaffolding, stale comments narrating the edit history, console.logs, TODO-without-owner, copy-pasted near-duplicates, files/exports nothing uses.

Each reviewer returns findings with file:line, severity (`blocker` / `should-fix` / `nitpick`), and a one-line rationale. Tell reviewers explicitly: this is an early-stage product — do not chase theoretical edge cases; mark anything debatable as `nitpick`.

## 3. Verify findings — never blindly accept

For each `blocker` and `should-fix` finding, spawn verification subagents (in parallel) that adversarially check the finding against the actual code and verdict **APPLY / APPLY-MODIFIED / REJECT** with reasoning. Drop rejected findings. Nitpicks don't need verification — they're reported, not necessarily fixed.

## 4. Fix, check, loop

- Apply verified `blocker`/`should-fix` fixes. Apply nitpicks only when trivial and clearly right; otherwise list them in the PR for Ben to judge.
- **Checkpoint:** commit fixes in logical groups (e.g. one commit per axis or per concern) so the fix history is reviewable on its own.
- Run `pnpm ci:check` (prettier, knip, tsc, oxlint). Fix failures and re-run until clean. If a fix was substantial (not formatting/lint), run a quick re-review of just that change.
- Loop until ci:check passes and no verified findings remain unaddressed.

## 5. Push and open/update the PR

- Push the branch. Open a PR against `main` if one doesn't exist; otherwise update the existing PR's description.
- PR description requirements:
  - **High-level** — what changed and why, written for a human skimming. No file paths, no per-file changelog.
  - **How to review** — a short ordered guide: what to look at first, what the risky/judgment-call areas are, what was deliberately left out of scope.
  - **Review notes** — unfixed nitpicks and any REJECT verdicts worth a second opinion, clearly labeled as such.
- Report back to Ben: PR link, one-paragraph summary, and anything that still needs his judgment. Do not merge.
