# Papercuts

Small, non-blocking friction in the repository itself — the kind that will
waste the next contributor's time too. Log it in the moment; review and fix
entries in a separate, user-requested cleanup pass.

This is not a completed-work log, a bug tracker, or a place for the agent's own
sandbox/shell/network hiccups. Never include secrets, credentials, personal
data, or sensitive paths.

## Open

- [ ] `2026-08-05T20:59:09Z` — `codex` — The documented `pnpm seed:rank-tracking` command fails before opening local D1 because `scripts/seed-rank-tracking.ts` imports the provider-aware `src/db/schema` barrel and plain `tsx` cannot load the resulting `cloudflare:workers` URL. Keep the seed script on dialect-local schema imports or run it through a Workers-compatible execution path. (Workaround: seed via raw SQL with `wrangler d1 execute DB --local`.)
- [ ] `2026-08-01T16:28:36Z` — `claude` — web's pinned wrangler 4.71.0 fails `kv namespace create` with a bare "Authentication error [code: 10000]" even though the OAuth token has workers_kv write scope; wrangler@4.118.0 succeeds with identical auth. Fix: bump wrangler in web/package.json.
- [ ] `2026-07-20T20:08:28Z` — `claude` — In a fresh git worktree, `oxlint --type-aware` crashes with `Cannot find module '@oxlint/binding-darwin-arm64'` — the platform-specific optional dep is missing from the worktree's node_modules while tsc/prettier work fine, and plain `pnpm install` reports up-to-date without restoring it; `pnpm install --force` (~22s) fixes it. Worth making the worktree-setup hook (or a documented step) run the forced install so lint doesn't die on fresh worktrees.
- [ ] `2026-07-19T04:06:52Z` — `codex` — `pnpm --dir web build` fails with `vite: command not found` when `web/node_modules` is absent, despite the root toolchain being installed. Document or enforce the package-local install required before validating the `web/` subpackage.
- [ ] `2026-07-19T02:55:56Z` — `claude` — Adding a docs folder under `web/content/docs` whose `meta.json` lists an `[Overview](...)` link renders a duplicated, double-highlighted sidebar entry, because the folder-index strip in `web/src/lib/source.ts` (`transformPageTree.folder`) is a per-folder-name allowlist. Derive it from the meta convention (or strip the index for all folders) so new sections don't need a hidden source.ts edit.
- [ ] `2026-07-14T01:28:30Z` — `claude` — Regenerating the lockfile (adding or moving a dep) makes `pnpm install` re-run the `minimumReleaseAge` gate on transitive peers already pinned at that exact version (`mysql2`, `sql-escaper`, `@aws-sdk/credential-providers`), failing the install even though nothing about them changed. `pnpm install --config.minimumReleaseAge=0` — then confirm the lockfile diff stays version-neutral — unblocks it; worth documenting that regen step so the gate doesn't re-block already-pinned versions.
- [ ] `2026-07-10T21:28:46Z` — `codex` — `pnpm --dir badseo run typecheck` works through the root toolchain but `pnpm --dir badseo run build` can't find Vite because `badseo/node_modules` is absent. Document or enforce the package-local install before validating the `badseo/` subpackage.
- [ ] `2026-07-10T21:32:10Z` — `codex` — Formatting the `badseo/` workspace with `pnpm exec prettier` fails because Prettier is only available from the repository root. Document the root-only formatter command or expose a workspace-local formatting script.

## Resolved

Move fixed entries here, mark them checked, and append the resolving date or commit.

## badseo harness vs `wrangler dev`: sitemap emits badseo.dev locs locally

`badseo/scripts/run-audit.ts` against a local `wrangler dev --port 8787` fails 4
sitemap-dependent checks (orphan page, 500, 403, duplicate-content) with
NOT CRAWLED: wrangler dev adopts the `badseo.dev` custom-domain route as the
host the worker sees, so `/sitemap.xml` emits `http://badseo.dev/...` locs that
the crawler's same-origin filter drops. Run it as
`wrangler dev --port 8787 --local-upstream "localhost:8787"` (after
`vite build`). Also: `pnpm --filter badseo audit` fails with
"Unknown option: 'recursive'" from the repo root — badseo is its own pnpm
workspace, not a root workspace member; use `npx tsx badseo/scripts/run-audit.ts`.
