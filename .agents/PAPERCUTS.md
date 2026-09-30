# Papercuts

Small, non-blocking friction in the repository itself — the kind that will
waste the next contributor's time too. Log it in the moment; review and fix
entries in a separate, user-requested cleanup pass.

This is not a completed-work log, a bug tracker, or a place for the agent's own
sandbox/shell/network hiccups. Never include secrets, credentials, personal
data, or sensitive paths.

## Open

- [ ] `2026-09-30T22:42:22Z` — `codex` — A fresh root install cannot start Vite: dependency optimization imports `use` from the Solid server entry through `@tanstack/devtools-ui`, even with `VITE_SHOW_DEVTOOLS=false`. Make the devtools dependencies use browser resolution during optimization, or exclude them from that pass so contributors can preview the app.

- [ ] `2026-09-30T19:03:30Z` — `codex` — The `no-array-sort` lint diagnostic recommends `toSorted()`, but the configured TypeScript library rejects it. Use the existing Remeda `sortBy` helper; align the lint guidance with the supported library target.
- [ ] `2026-09-30T07:08:59Z` — `claude` — On a clone of the origin repo, `git tag --sort=-creatordate | head -1` (openseo-release-notes step 2) and `pnpm release:notes` (which defaults `--from` to the latest local semver tag) both resolve to `v0.0.6`, because release tags are published only on `every-app/open-seo`; the real base had to come from `gh release list --repo every-app/open-seo`. Have the skill and script read the latest release from the public repo instead of local tags.
- [ ] `2026-09-30T07:08:59Z` — `claude` — openseo-release-notes says to look up `(#NN)` on `bensenescu/open-seo` first and fall back to `every-app/open-seo`, but PR numbers collide across the two repos: the commit "Rank Tracking strategy library (#340)" is `every-app/open-seo#340`, while `bensenescu/open-seo#340` is an unrelated merged PR, so the origin-first lookup silently returns the wrong one. Tell the skill to compare the fetched PR title with the commit subject and retry on the public repo when they differ.

- [ ] `2026-09-27T19:32:00Z` — `claude` — Through the `pnpm dev:agents` portless `.localhost` URL, SAM chat opens then fails with "Failed to fetch": the agents client loads history over a URL that ends in `ERR_SSL_PROTOCOL_ERROR`. The same chat works at `http://127.0.0.1:<port>` from `.logs/dev-server.log`. Document that SAM QA needs the direct origin, or make the portless proxy carry the agents HTTP and WebSocket routes.
- [ ] `2026-09-24T21:20:00Z` — `claude` — `pnpm format:write` is `prettier . --write`, so passing file paths (`pnpm format:write src/foo.ts`) silently formats the whole repository instead of the named files, which surprises agents working in parallel on one checkout. Use `pnpm exec prettier --write <files>` for targeted runs, or make the script forward arguments.
- [ ] `2026-09-23T05:50:00Z` — `claude` — `pnpm install --frozen-lockfile` in `web/` rewrites the tracked `web/pnpm-workspace.yaml`, adding an `allowBuilds` block with `esbuild`/`workerd` set to the placeholder "set this to true or false". This leaves a dirty tree that is easy to commit by accident. Commit explicit `allowBuilds` values for those two packages.
- [ ] `2026-09-23T04:52:00Z` — `claude` — `pnpm dev:agents` names the portless host after the git branch, and Linear branch names like `carter/eve-125-keyword-research-city-and-county-volume-not-just-country` make a 64-character DNS label (limit 63), so browsers show `chrome-error` for the `.localhost` URL. Workaround: open `http://127.0.0.1:<port>` from `.logs/dev-server.log`; fix: pass a truncated `--name` to portless in the script.
- [ ] `2026-09-22T02:21:38Z` — `codex` — The documented portless `.localhost` development URL produces a Google OAuth `invalid_request` because Google rejects that callback hostname. Document registering `http://localhost:<assigned-port>/api/gsc/oauth/callback` and starting the connection from that direct origin while the server remains managed by portless.
- [ ] `2026-09-18T10:06:56Z` — `codex` — Website browser tests flood Vite output with "Assets in public directory cannot be imported from JavaScript" for MDX library images. Adjust the MDX image handling to retain public image URLs instead of generating imports, so useful test failures remain visible.
- [ ] `2026-09-03T00:00:00Z` — `claude` — `pnpm ci:check` does not run `pnpm build`, so a route file that pulls `cloudflare:workers` into the client bundle passes every check and still breaks the build (hit on the dynamic-reports branch). Add a build step to `ci:check`, or document that `pnpm build` must be run separately before opening a PR.
- [ ] `2026-09-11T00:13:05Z` — `codex` — The web-content review skill points to the removed `src/server/features/onboarding/openseo-fact-sheet.md`; the reference now lives at `src/server/features/sam/openseo-fact-sheet.md`. Update the skill's pointer so content reviews reach the current fact sheet.

- `2026-09-05T23:52:53Z` — `codex` — After `pnpm build` ran alongside an active Vite dev server, browser navigation failed and server functions returned undefined. The server logged `Cannot read properties of undefined (reading 'map')` in `runInRunnerObject` / `loadEntries`. Restarting Vite restored the same dashboard without code changes. Stop and restart the dev server around production builds before browser QA; consider documenting or isolating the shared build/runtime state.
- [ ] `2026-09-27T22:06:28Z` — `claude` — Hosted auth mode can't run behind `pnpm dev:agents`: `hostedBaseUrlSchema` in `src/lib/auth.ts` accepts only https or the exact host `localhost`, so a portless `*.localhost` `BETTER_AUTH_URL` returns 500, and setting `TURNSTILE_SITE_KEY` without `TURNSTILE_SECRET_KEY` turns every `/api/auth` call into a bare "Missing Better Auth hosted configuration" 500. Workaround: run `vite dev --port <n> --strictPort` with `BETTER_AUTH_URL=http://localhost:<n>`; fix: accept `*.localhost` over http and name the missing variable in the error.

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
