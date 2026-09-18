# Papercuts

Small, non-blocking friction in the repository itself — the kind that will
waste the next contributor's time too. Log it in the moment; review and fix
entries in a separate, user-requested cleanup pass.

This is not a completed-work log, a bug tracker, or a place for the agent's own
sandbox/shell/network hiccups. Never include secrets, credentials, personal
data, or sensitive paths.

## Open

- [ ] `2026-09-03T00:00:00Z` — `claude` — `pnpm ci:check` does not run `pnpm build`, so a route file that pulls `cloudflare:workers` into the client bundle passes every check and still breaks the build (hit on the dynamic-reports branch). Add a build step to `ci:check`, or document that `pnpm build` must be run separately before opening a PR.
- [ ] `2026-09-11T00:13:05Z` — `codex` — The web-content review skill points to the removed `src/server/features/onboarding/openseo-fact-sheet.md`; the reference now lives at `src/server/features/sam/openseo-fact-sheet.md`. Update the skill's pointer so content reviews reach the current fact sheet.

- `2026-09-05T23:52:53Z` — `codex` — After `pnpm build` ran alongside an active Vite dev server, browser navigation failed and server functions returned undefined. The server logged `Cannot read properties of undefined (reading 'map')` in `runInRunnerObject` / `loadEntries`. Restarting Vite restored the same dashboard without code changes. Stop and restart the dev server around production builds before browser QA; consider documenting or isolating the shared build/runtime state.

## Deferred

- `2026-08-01T16:28:36Z` — `claude` — `web/`'s locked Wrangler 4.71.0 reportedly failed `kv namespace create` with authentication error 10000 while a newer version worked. The locked version is unchanged, but the auth failure was not reverified on 2026-09-05; revisit during routine website dependency maintenance or if this command blocks current work.
- `2026-07-19T02:55:56Z` — `claude` — Docs folders with an explicit Overview link need their index removed by the allowlist in `web/src/lib/source.ts`. Both current folders using that convention are covered as of 2026-09-05; revisit when adding another such section, rather than generalizing navigation now.

## Resolved

- [x] `2026-09-17T18:50:14Z` — `codex` — Fumadocs MDX 11 compiles `.md?raw` imports into components, so shared prompt imports pass type checking but crash docs rendering with `trim is not a function`. Resolved 2026-09-17: the web Vite config leaves `?raw` imports to Vite; browser-check shared Markdown prompts when changing this integration.

- [x] `2026-08-20T20:36:32Z` — `codex` — The preview Access check immediately classified a workers.dev 404 as public. Resolved 2026-09-05: 404s use the existing bounded retry loop; exhaustion fails without claiming the preview is protected or public.
- [x] `2026-08-18T03:06:44Z` — `claude` — MCP clients can reject results using cached output schemas after hot reload. Resolved 2026-09-05: `verify-local-mcp` now instructs clients to refresh tool discovery or reconnect after schema edits, before another provider call.
- [x] `2026-08-05T20:59:09Z` — `codex` — `pnpm seed:rank-tracking` failed in Node on the provider-aware schema's `cloudflare:workers` import. Resolved 2026-09-05: the script imports SQLite tables directly, matching `seed-projects.ts`.
- [x] `2026-07-19T04:06:52Z` — `codex` — Website builds require a package-local install even when root dependencies exist. Resolved 2026-09-05: `docs/LOCAL_DEVELOPMENT.md` documents the website install, dev, and validation commands.
- [x] `2026-07-10T21:28:46Z` — `codex` — BadSEO builds require a package-local install even when root typechecking works. Resolved 2026-09-05: local-development docs and `badseo/README.md` explain both dependency installs.
- [x] `2026-07-10T21:32:10Z` — `codex` — BadSEO has no package-local Prettier. Resolved 2026-09-05: its README and local-development docs give the root formatter command.
- [x] `2026-09-05T00:44:38Z` — `codex` — The older, undated BadSEO note described wrong-origin sitemap URLs under direct `wrangler dev` and a broken `pnpm --filter badseo audit` command. Resolved 2026-09-05 through documentation: use the existing Vite dev server and package audit script; the README states the expected sitemap origin and the harness usage comment now matches. Direct Wrangler behavior was not reverified or changed.
