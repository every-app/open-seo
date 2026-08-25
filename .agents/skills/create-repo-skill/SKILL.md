---
name: create-repo-skill
description: Create or update a skill in this repository the right way — canonical home in .agents/skills, internal-vs-public marking, symlink mirroring into .claude/skills, and public docs registration for product skills. Use whenever adding a new skill, converting a workflow into a skill, or when .claude/skills and .agents/skills look out of sync.
metadata:
  internal: true
---

# Create a repo skill

## The layout (invariants)

- **`.agents/skills/<kebab-name>/SKILL.md` is the only canonical home for every skill** — public product skills (SEO workflows customers install) and internal repo skills (agent workflows like `merge-ready`, `papercuts`, this one) alike. Users install from this tree via `npx skills add every-app/open-seo`.
- **`.claude/skills/` contains only symlinks into `.agents/skills/`** — one per skill that Claude Code agents working in this repo should auto-load. Never copy files: `.agents/skills/` is prettier-ignored (vendored skills are hash-pinned) while `.claude/skills/` is not, so a copy gets reformatted on the `.claude` side and the trees drift — this happened to three skills before symlinks became the rule. `prettier --check .` does not descend into the symlinks, so a symlink stays byte-identical to its canonical source by construction.
- **Vendored skills** (external origin) are hash-pinned in `skills-lock.json` (currently only `webapp-testing`, from `anthropics/skills`). Never hand-edit a vendored skill's content; re-vendor with the `skills` CLI so the lock hash stays valid.
- `.agents/skills/**` is part of the **review control plane** (see `AGENTS.md`): changes require explicit maintainer review via CODEOWNERS. Make the change on a branch and call it out in the PR — never treat skill edits as incidental.

## Creating a skill

1. `mkdir .agents/skills/<kebab-name>` and write `SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <kebab-name>            # must match the directory name
   description: <what it does + explicit "use when ..." triggers>
   metadata:
     internal: true              # ONLY for internal repo skills — omit for product skills
   ---
   ```

2. Decide which kind it is:
   - **Internal repo skill** (agent/dev workflow): set `metadata.internal: true`. Do NOT register it on any public surface. If repo agents should auto-load it, add the mirror symlink:

     ```bash
     ln -s ../../.agents/skills/<name> .claude/skills/<name>
     ```

   - **Public product skill** (a customer-facing SEO workflow): no `internal` flag, usually no `.claude/skills` symlink (repo agents don't need customer workflows). A public skill is **auto-served to SAM, the live in-app agent** — the marking is fail-open, so a missing `internal: true` ships repo-dev instructions to end users. Give it the standard "Project context" preamble (copy a sibling like `seo-audit`) with the skill's required sections, and register it everywhere users discover skills:
     - `src/server/features/sam/samSkills.test.ts` — add the name to the pinned public roster (the test fails otherwise; that failure is the guard)
     - `web/content/docs/skills/<name>.mdx` — docs page (mirror a sibling like `competitor-analysis.mdx`: what it does, when to use it, what you get back, how to get the best result)
     - `web/content/docs/skills/index.md` — bullet in the right workflow section
     - `web/content/docs/skills/meta.json` — nav entry
     - `src/routes/_app/ai.tsx` — `SKILL_NAMES`
     - `.agents/skills/seo-coach/SKILL.md` — one line in the "What each workflow does" roster
     - `plugins/openseo/skills/<name>` — add the skill to the `skills` list in `scripts/sync-plugin-skills.mjs`, then run `pnpm sync-plugin-skills` (this directory holds real copies, not symlinks — the Claude Code and Codex plugins bundle from here, and Codex's installer silently skips symlinked files, so a symlink would ship a skill-less plugin). `pnpm ci:check` re-runs the sync and fails on drift, so a missed update here is caught, but the skill count and roster below are prose and aren't checked — update them by hand: both `plugins/openseo/*/plugin.json` `description` fields, the Codex manifest's `interface.longDescription`, and the skill lists in `web/content/docs/claude-code-plugin.md` and `web/content/docs/codex-plugin.md`
     - Optional: `web/src/lib/feature-pages.ts` and `web/content/docs/skills/setup.md` if it deserves marketing/setup placement

3. If the skill references MCP tools, use exact tool names and keep them in sync with `src/server/mcp/server.ts` — the tool names in skills are load-bearing for agents following them. For public skills also check `src/server/features/sam/samChatTools.ts`: SAM's toolset is a curated subset, and a skill step that names a tool SAM lacks dead-ends in the in-app agent.

4. `pnpm format:write` (covers the docs pages; `.agents/skills` itself is intentionally untouched), then commit. Skill prose follows `openseo-review-web-content` standards when public.

## Sync check (run when in doubt, and after any skill change)

```bash
for d in .claude/skills/*/; do n=$(basename "$d")
  [ -L "${d%/}" ] || echo "DRIFT RISK — not a symlink: $n"
  [ -e ".agents/skills/$n" ] || echo "BROKEN — no canonical source: $n"
done
```

Anything flagged: move the canonical content to `.agents/skills/<name>/` (reconciling differences deliberately — diff both sides first, newest intent wins), delete the `.claude` copy, and replace it with the symlink.
