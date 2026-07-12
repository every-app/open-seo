---
name: papercuts
description: Log small, non-blocking repository and agent-workflow friction to .agents/PAPERCUTS.md, or review, deduplicate, and resolve existing entries. Use proactively when a tool call has to be retried, setup or documentation is confusing, a command is flaky, a cache is stale, an error is misleading, or a non-obvious gotcha wastes time. Also use when the user asks to review, fix, or clean up papercuts.
---

# Papercuts

Capture small friction in the moment without derailing the current task. Aggregated entries show where the repository needs sanding down.

## Decide whether it is a papercut

A papercut is small, non-blocking friction in the repository, tooling, documentation, or agent workflow that is easy to push through but likely to waste time again.

Do not log:

- A product or code correctness bug that should be fixed now or tracked as real work.
- What the agent accomplished; that belongs in the task summary.
- Secrets, credentials, personal data, raw customer payloads, or sensitive paths.
- A one-off typo with no plausible recurrence.

## Log proactively

1. Search `.agents/PAPERCUTS.md` for an equivalent entry and avoid duplicates.
2. Append one unchecked item under `## Open` using this format:

   ```markdown
   - [ ] `YYYY-MM-DDTHH:MM:SSZ` — `agent` — While <doing X>, <friction happened>. <Workaround, likely cause, or smallest useful improvement>.
   ```

3. Keep it to one or two sentences: what you were doing, what got in the way, and optionally the likely fix.
4. Continue the original task. Do not opportunistically expand a papercut into unrelated work.

Use UTC timestamps. Use a short agent label such as `codex`, `claude`, or `human` and include a PR or task identifier only when it helps future triage.

## Review or resolve

Only mine a whole session or perform a broad papercut review when the user explicitly asks. Proactive behavior is limited to logging friction as it occurs.

When asked to review the file:

1. Deduplicate and group related entries.
2. Verify each open papercut still exists.
3. Fix the smallest safe, high-leverage entries first.
4. Move fixed items to `## Resolved`, check them, and append the resolving date or commit.
5. Route real bugs to normal issue/fix work. Route recurring review-policy gaps through `maintain-greptile-rules` instead of turning them into papercuts.

Preserve useful history; do not delete resolved entries merely to make the file shorter.
