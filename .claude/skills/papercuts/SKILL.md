---
name: papercuts
description: Log genuine, recurring repository friction to .agents/PAPERCUTS.md — confusing setup, a flaky repo command or script, a misleading in-repo error, stale generated files, or a non-obvious gotcha that will cost the next contributor time. Also use to review, deduplicate, and resolve existing entries. Gate hard before logging: only friction the repository itself can fix counts. Never log the agent's own sandbox/permission errors, shell-scripting mistakes, transient flakiness, or third-party tool quirks the repo can't change.
---

# Papercuts

Capture small friction in the moment without derailing the current task.
Aggregated entries show where the repository needs sanding down — so the bar is
that a _different_ contributor would hit the same thing, and the _repository_
can do something about it.

## The two-question test

Log it only if **both** are true:

1. **Reproducible for anyone.** A different person, on a fresh checkout, working
   in this repo would hit the same friction. It is not specific to your sandbox,
   shell config, machine, network, or a one-time hiccup.
2. **Fixable in the repo.** A change to the repo's code, config, scripts, or
   docs would prevent or reduce it.

If either answer is "no," push through it and move on — do not log it.

## Do NOT log

- **Your environment's failures.** Sandbox `EPERM` / `listen` / IPC-socket
  errors, blocked network or `fetch failed`, permission denials, missing system
  tools. That is the runner, not the repo.
- **Your own shell mistakes.** Reserved or special variable names (`status`,
  `path`), unquoted globs, a broken login-shell hook. Fix the command — there is
  nothing in the repo to sand down.
- **Transient flakiness.** A command that succeeded on retry with no repo-side
  cause (a network blip, a hung push, a slow mirror).
- **Local state you corrupted.** A partial `node_modules` after branch-switching,
  a stale dev-server port, a dirty cache. Re-run the install or cleanup.
- **Third-party or beta-tool limitations the repo can't change** — unless the
  fix is a repo-side workaround worth writing down (then log _that_ workaround).
- Product or code correctness bugs (fix now or track as real work), and what you
  accomplished (that belongs in the task summary).
- Secrets, credentials, personal data, raw customer payloads, or sensitive paths.

When something fails, first ask "is this the repo, or is this me/my environment?"
Only the former is a papercut.

## Log proactively

1. Search `.agents/PAPERCUTS.md` for an equivalent entry and avoid duplicates.
2. Append one unchecked item under `## Open` using this format:

   ```markdown
   - [ ] `YYYY-MM-DDTHH:MM:SSZ` — `agent` — <friction, and the smallest useful fix or workaround>.
   ```

3. Keep it to one or two sentences: what got in the way, and the likely repo-side
   fix. Lead with the friction, not with what you were doing.
4. Continue the original task. Do not expand a papercut into unrelated work.

Use UTC timestamps and a short agent label (`codex`, `claude`, `human`). Add a
PR or task identifier only when it helps future triage.

## Review or resolve

Only mine a whole session or do a broad review when the user explicitly asks.

When asked to review the file:

1. Re-run the two-question test on every open entry; delete any that fail it
   (environment/shell/flake noise that slipped in).
2. Deduplicate and group related entries.
3. Verify each surviving papercut still reproduces.
4. Fix the smallest safe, high-leverage entries first.
5. Move fixed items to `## Resolved`, check them, and append the resolving date
   or commit. Route real bugs to normal issue/fix work; route recurring
   review-policy gaps through `maintain-greptile-rules`.

Preserve useful history for genuinely-resolved papercuts; do not delete them
merely to make the file shorter. (Noise that never belonged — see step 1 — is
different: remove it.)
