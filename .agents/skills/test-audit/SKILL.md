---
name: test-audit
description: "Invoke whenever writing, changing, reviewing, or sweeping Vitest tests in this repo. Authoring gate for new or changed tests, plus an audit workflow for low-value, implementation-coupled, or duplicative tests and the test-only production seams they keep alive. Use when asked to add tests, review tests, clean up tests, or when a PR touches *.test.ts."
metadata:
  internal: true
---

# Test Audit

Three modes, one value bar. **Authoring mode** gates every new or changed test
at write time. **Audit mode** runs focused sweeps for tests that re-assert
source, duplicate stronger proof, couple behavior to implementation, or keep
test-only production seams alive. **Campaign mode** reviews every test file
with a per-test verdict when the maintainer asks to prune the whole suite; see
[Campaign mode](#campaign-mode). Optimize for confidence, not deletion count.
Land one coherent batch per PR; continue broad audits as separate follow-ups.

The repository's own rules live in the "Testing" section of `AGENTS.md`. This
skill is the procedure for applying them; when the two disagree, `AGENTS.md`
wins and this file needs an update.

## Authoring gate

Before adding a test, answer four questions. A missing answer means do not add
it yet:

1. What observable behavior, invariant, or independent contract does it protect?
2. What credible regression makes it fail?
3. Why does existing coverage not already catch that failure? Each contract has
   one primary owner at the strongest boundary (usually the service or the MCP
   tool handler, not the repository or a private helper). Another layer needs
   its own distinct risk. Prefer extending a table-driven case or a shared
   factory (`ga4-test-fixtures.ts`, `tool-test-support.ts`) over a
   near-duplicate test, and consolidate duplicated setup in the same change.
4. Does it need a production seam (export, flag, wrapper, injection hook) that
   no production caller needs? If yes, test at the real boundary instead.
   Grep the whole repo for callers, not just `src/`; `scripts/` counts.

Then check the test against every [junk pattern](#junk-patterns); a match fails
the gate unless the [retention bar](#retention-bar) names the contract it
independently guards. A test that would break under behavior-preserving
refactoring is asserting implementation, not behavior; rewrite it at the owning
boundary before landing it.

Bug regression tests must fail on the pre-fix code for the intended reason and
pass after the fix. A regression test that never demonstrably failed proves the
mock, not the fix. One regression at the owner boundary covers the bug; do not
replay it at every layer it crosses.

## Junk patterns

The shared checklist for both modes. The authoring gate rejects a new test that
matches one; audits hunt for existing tests that do.

Repo-specific (each is a `AGENTS.md` rule):

- per-test `await import()` or `vi.resetModules()` without a comment explaining
  which module-level state must reset;
- a production class re-declared inside a test instead of imported from a leaf
  module (`ga4Errors.ts`, `gscErrors.ts` are the pattern);
- `mockReset` / `mockClear` ceremonies in `beforeEach` (Vitest `clearMocks` is
  already on);
- fixtures longer than the assertions that read them, or inline copies of a
  shape that already has a factory;
- Zod schemas or third-party libraries re-tested through the module under test;
- an output-schema round-trip repeated in every happy path;
- Drizzle builder chains mocked (`select().from().where()` with `vi.fn()`
  chains); repositories are tested through services or real SQL;
- argument forwarding to a mock asserted when the mapping is not the contract
  (billing params and telemetry events are the contract; internal helper
  arguments are not).

General:

- assertion-free coverage probes;
- self-comparisons, and expected values produced by the helper or renderer
  under test;
- copied fixtures, inventories, manifests, or export lists;
- exact source, import, or string greps;
- private predicate or call-shape tests duplicated at real boundaries;
- duplicate invocations of the same contract;
- tests whose only purpose is preserving test-only exports or wrappers;
- dead production code whose only callers are tests;
- mocks that implement the asserted behavior, or one identical mock standing in
  for different APIs;
- negative controls that pass for an unrelated reason, such as a denial from a
  different guard or a rejection the production path never reaches;
- names or fixtures that promise more than the input exercises.

## Value bar

Tests justify their maintenance cost by protecting behavior, a credible
regression, or an independently meaningful contract. In an audit, an existing
test that must change for behavior-preserving source reorganization is suspect,
not automatically deletable; the authoring gate still rejects new ones.

Before judging a candidate, read the complete test and its production owner,
the entry point, callers, callees, sibling implementations, overlapping tests,
and relevant git history. When the test claims dependency-backed behavior
(DataForSEO response shapes, Autumn, Better Auth, Drizzle), inspect the
dependency source or types directly.

## Discovery

Keep discovery read-only and report evidence before editing. For broad scope,
run parallel read-only lanes (Explore subagents work well):

- `src/server/mcp/` and `src/server/mcp/tools/`;
- `src/server/lib/`, `src/server/auth/`, `src/server/billing/`,
  `src/server/workflows/`, `src/serverFunctions/`;
- `src/server/features/`;
- `src/client/`, `src/shared/`, `src/lib/`, `src/types/`, `scripts/`,
  `web/tests/`, plus a cross-cutting grep sweep for the repo-specific patterns
  above.

Prefer a few high-confidence candidates over a large speculative inventory.

## Campaign mode

Use only when the maintainer explicitly asks for a suite-wide prune. Run the
pipeline in two phases with disjoint file slices so agents never edit the same
file:

1. **Review, read-only.** Split every `*.test.ts` into 6-8 slices balanced by
   line count and grouped by directory. One reviewer per slice reads each test
   file and its production owner completely and writes a report with a table
   per file: test name, DELETE / MERGE / KEEP, one-line evidence naming the
   code change that would fail it or the test that already owns it. The
   report also lists test-only production seams (with callers checked in
   `src/`, `scripts/`, `tests/badseo/`, `web/`), test support that becomes unused,
   whole files to delete, and a "risky calls" section. Reviewers do not edit.
2. **Apply, per slice.** One applier per slice re-verifies each DELETE and
   MERGE against the source before acting, keeps anything whose evidence does
   not hold, folds MERGE rows into table-driven siblings, deletes newly unused
   fixtures and mocks, and skips every risky item, listing it back for the
   maintainer. If a deletion's justification cites a test in another slice,
   the applier confirms that test still exists at the end of its run.

Rules that hold throughout a campaign:

- The only permitted non-test edit is removing an `export` keyword from a
  helper whose remaining callers are all tests. Knip fails `ci:check` on the
  orphaned export otherwise. Never remove parameters, delete branches, or
  change behavior in the same change, even when a test looks like the only
  reason the code exists; report those as follow-ups.
- Route modules under `src/routes/` and barrel files keep their exports.
- Use `pnpm exec prettier --write <files>`; `pnpm format:write` ignores
  arguments and formats the whole repository.
- After all slices land, run the full suite in normal order and with two or
  three `--sequence.shuffle.tests --sequence.seed=<n>` runs. Removing reset
  ceremony can surface latent order dependence; fix it by setting the mock's
  default in `beforeEach`, never by restoring the ceremony.

## Retention bar

Keep a test when it independently enforces a public API, MCP tool contract,
Zod boundary schema, config, migration, storage (both SQLite and Postgres),
billing, auth, security, default, prompt-byte, or package contract. Also keep:

- call ordering when order is observable behavior;
- regressions with a credible failure mode;
- source inspection when it is the cheapest independent guard: it fails when
  the contract changes (a user-facing key, byte, or path) and survives an
  identifier-only refactor. The pinned SAM skill roster in `samSkills.test.ts`
  and the unique-index parity check in `src/db/schema-parity.test.ts` are this kind;
- a retained test that fails on the baseline: treat it as a possible product
  bug, reproduce it, and repair the owner rather than deleting it.

Static or slow is not a deletion reason. A test that resembles implementation
may still be the independent contract; prove otherwise before removing it.

## Candidate evidence

Record every field before editing. A missing field means the candidate is not
ready for deletion:

- exact test name and location;
- what failure it can actually detect;
- non-test callers of the covered production or support seam, including
  `scripts/`, `tests/badseo/`, and `web/` (a profiling script is still a caller);
- stronger remaining owner-boundary proof, or why no proof is needed;
- relevant history and the reason the test or seam exists;
- production or test-support deletion unlocked;
- risk and the focused validation command.

## Edit shape

Choose one coherent owner-boundary batch. Delete obsolete test-only exports,
wrappers, and dead production paths instead of preserving aliases (Knip will
flag survivors in `pnpm ci:check`). Move retained regressions to their
canonical owners. Consolidate repeated assertions into one table-driven case.

Prefer net-negative production LOC. Do not add replacement tests that restate
the same implementation, and do not convert uncertain candidates into cleanup
to increase deletion counts.

## Validation

Never edit tests while Vitest is running in the checkout.

1. Run the owner and sibling tests: `pnpm exec vitest run <path-or-filter>`.
2. For a removed source grep or static assertion, run the executable that owns
   the real contract (for example `pnpm sync-plugin-skills` for plugin skill
   drift).
3. `pnpm format:write`, then `pnpm ci:check` (prettier, knip, tsc, oxlint,
   plugin-skill sync). Knip failing on a now-unused export means delete the
   export, not re-add a test.
4. Run the full suite once: `pnpm test`.
5. Inspect `git diff --numstat`; report production/tooling separately from
   tests and test support.

## Landing

Commit, push, or open a PR only when authorized. Use the `merge-ready` skill
for the review and PR flow. If a verified finding exposes a recurring
invariant that `.greptile/` does not capture, use `maintain-greptile-rules`;
do not promote one-off cleanups into permanent rules. Log repository friction
met along the way with `papercuts`.

## Handoff

Report:

- removed low-value categories and the root cause behind them;
- production owner simplifications;
- retained false positives and why they remain valuable;
- focused and full proof actually run, with real output;
- production versus test LOC;
- PR and merge state;
- named follow-ups.
