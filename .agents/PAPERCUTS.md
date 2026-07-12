# Papercuts

Small, non-blocking friction encountered while working in this repository. Log it in the moment; review and fix entries in a separate, user-requested cleanup pass.

This is not a completed-work log or a bug tracker. Never include secrets, credentials, personal data, or raw customer payloads.

## Open

- [ ] `2026-07-10T21:09:27Z` — `codex` — While building the TanStack/Cloudflare badseo app, Wrangler reported an EPERM writing its debug log under the user preferences directory even though the build succeeded. Set `WRANGLER_LOG_PATH` to a writable temporary path in sandboxed build commands or make the logging failure non-fatal and quiet.
- [ ] `2026-07-10T17:53:20Z` — `codex` — While validating `.greptile/`, both `pnpm exec prettier --check` and the existing `pnpm format:check` attempted to reconcile `node_modules` and aborted because no TTY was available. Calling `node_modules/.bin/prettier` performed the non-installing check successfully; the agent/CI path needs a stable way to run package scripts without an interactive modules purge.
- [ ] `2026-07-10T18:12:35Z` — `codex` — While validating referenced files in zsh, using `path` as a loop variable overwrote zsh's special `path` array and made commands such as `git`, `jq`, and `sed` appear missing later in the same shell. Use a neutral name such as `file_path` in shell loops.

## Resolved

Move fixed entries here, mark them checked, and append the resolving date or commit.
