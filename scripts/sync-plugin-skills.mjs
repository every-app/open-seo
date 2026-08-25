#!/usr/bin/env node
// Codex plugin installs copy the plugin directory and skip symlinks, so
// plugins/openseo/skills/* must be real files, not symlinks to .agents/skills/*.
// Run this after editing any of the skills listed below. `pnpm ci:check` runs
// this and diffs the result, so a stale copy fails CI instead of shipping.
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = join(repoRoot, ".agents/skills");
const targetDir = join(repoRoot, "plugins/openseo/skills");

const skills = [
  "competitive-landscape",
  "competitor-analysis",
  "keyword-clustering",
  "keyword-research",
  "link-prospecting",
  "local-seo",
  "seo-audit",
  "seo-coach",
  "seo-project-setup",
];

// Wipe and rebuild so a skill removed from the list above doesn't leave a
// stale copy behind.
rmSync(targetDir, { recursive: true, force: true });
for (const skill of skills) {
  cpSync(join(sourceDir, skill), join(targetDir, skill), {
    recursive: true,
    dereference: true,
  });
}

console.log(`Synced ${skills.length} skills into plugins/openseo/skills/`);
