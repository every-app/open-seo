# Papercuts

Small, non-blocking friction encountered while working in this repository. Log it in the moment; review and fix entries in a separate, user-requested cleanup pass.

This is not a completed-work log or a bug tracker. Never include secrets, credentials, personal data, or raw customer payloads.

## Open

- [ ] `2026-07-11T21:38:29Z` — `codex` — While visually testing the BadSEO design lab, a stale local process still held the configured port 8787, so Vite silently moved the app to 8788. Make the active preview URL more visible in the normal workflow or provide a reliable task-local server cleanup step.
- [ ] `2026-07-10T21:32:49Z` — `codex` — While starting the BadSEO TanStack/Cloudflare dev server in a sandbox, the Cloudflare Vite plugin failed with `listen EPERM` while probing its inspector port, even though the app port was otherwise valid. Document the need for elevated local port binding or provide an inspector-disabled validation command.
- [ ] `2026-07-10T21:28:46Z` — `codex` — While validating the standalone BadSEO package after merging its TanStack migration, `pnpm --dir badseo run typecheck` appeared to work through the root toolchain but `pnpm --dir badseo run build` could not find Vite because `badseo/node_modules` was absent. Document or enforce the required package-local install before validation.
- [ ] `2026-07-10T22:32:40Z` — `codex` — While running the badseo audit from the workspace, sandboxed TSX failed with `listen EPERM` when creating its IPC socket under the temporary directory. Rerunning the same audit with local IPC permission succeeded; provide a sandbox-compatible TSX invocation for validation scripts.
- [ ] `2026-07-10T22:23:50Z` — `codex` — While pushing the consent-banner refinement to PR #380, the SSH push hung without output and a separate remote verification hung as well; retrying the same push succeeded immediately. Surface an actionable SSH timeout or connection error instead of waiting indefinitely.
- [ ] `2026-07-10T21:36:27Z` — `codex` — While using the repository's `webapp-testing` skill, its required Python Playwright import was unavailable in both system and bundled Python. The bundled Node Playwright runtime completed the check; document or provide that fallback, including Cloudflare Vite's default port 8787 rather than Vite's usual 5173.
- [ ] `2026-07-10T21:32:10Z` — `codex` — While formatting the standalone `badseo` workspace, `pnpm exec prettier` failed because Prettier is only available from the repository root. Document the root-only formatter command or expose a workspace-local formatting script.
- [ ] `2026-07-11T15:13:43Z` — `codex` — While inspecting a BadSEO merge with login-shell commands, zsh printed `(eval):5: parse error near \`end'` before otherwise successful Git output. Running the same commands with login-shell initialization disabled avoided the noise; identify and fix the malformed shell startup hook.
- [ ] `2026-07-11T15:15:13Z` — `codex` — While resolving a merge from the sandboxed BadSEO subdirectory, `git add` could not create the parent worktree's `index.lock` despite the merge itself being allowed. Staging required the approved elevated Git path; align the workspace write boundary with the actual Git worktree root.
- [ ] `2026-07-10T21:09:27Z` — `codex` — While building the TanStack/Cloudflare badseo app, Wrangler reported an EPERM writing its debug log under the user preferences directory even though the build succeeded. Set `WRANGLER_LOG_PATH` to a writable temporary path in sandboxed build commands or make the logging failure non-fatal and quiet.
- [ ] `2026-07-10T17:53:20Z` — `codex` — While validating `.greptile/`, both `pnpm exec prettier --check` and the existing `pnpm format:check` attempted to reconcile `node_modules` and aborted because no TTY was available. Calling `node_modules/.bin/prettier` performed the non-installing check successfully; the agent/CI path needs a stable way to run package scripts without an interactive modules purge.
- [ ] `2026-07-10T18:12:35Z` — `codex` — While validating referenced files in zsh, using `path` as a loop variable overwrote zsh's special `path` array and made commands such as `git`, `jq`, and `sed` appear missing later in the same shell. Use a neutral name such as `file_path` in shell loops.

## Resolved

Move fixed entries here, mark them checked, and append the resolving date or commit.
