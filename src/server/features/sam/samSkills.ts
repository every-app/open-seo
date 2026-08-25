import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { SkillSource } from "agents/skills";

// Bundle the repo's public-facing skills (.agents/skills) into SAM at build
// time. Skills marked `metadata.internal: true` are repo-dev tooling and stay
// out. The glob names the dot-directory literally, so Vite matches it.
//
// The source implements the `SkillSource` interface by hand (type-only import
// above): the `agents/skills` runtime module drags in the skill-*script*
// executor graph (@cloudflare/codemode, just-bash), which a static in-memory
// manifest doesn't need.
const skillFiles = import.meta.glob<string>("/.agents/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

// The skill bodies are written for external MCP clients (Claude Code); this
// note reframes the surface so SAM skips the steps that don't apply in-app.
const SAM_SURFACE_NOTE = `> Surface note: you are SAM, running inside the OpenSEO app. You are already
> authenticated and scoped to the user's current project — skip any "verify the
> MCP connection", "choose a project", or skill-install steps. You have no
> local filesystem: skip local-folder and file steps, and store durable
> outputs in project context instead (sections, competitors, key pages,
> research log).
>
> Your project context is already in your system prompt — read it there; there
> is no get_project_context tool here. Write changes with
> update_project_context. If a skill step needs a tool you don't have (e.g.
> project creation), say so and point the user at the app page rather than
> improvising. Keep SAM's chat voice: a skill's output format is a
> checklist of what to cover, not a document template to fill.`;

type SamSkill = { name: string; description: string; body: string };

const frontmatterSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().min(1),
  metadata: z.looseObject({ internal: z.boolean().optional() }).optional(),
});

function parseSkill(path: string, raw: string): SamSkill | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`Skill has no frontmatter: ${path}`);
  const parsed = frontmatterSchema.safeParse(parseYaml(match[1]));
  if (!parsed.success) {
    throw new Error(`Skill frontmatter needs name + description: ${path}`);
  }
  const frontmatter = parsed.data;
  if (frontmatter.metadata?.internal === true) return null;
  // Public for `npx skills add` users but not an in-app workflow: it drafts
  // GitHub issues for contributors, which SAM has no surface for.
  if (frontmatter.name === "simple-issue-description") return null;
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    body: `${SAM_SURFACE_NOTE}\n\n${match[2].trim()}`,
  };
}

// Content hash so Think's registry refreshes the catalog when a deploy ships
// changed skills (djb2 — stability matters here, not collision resistance).
function fingerprint(skills: SamSkill[]): string {
  let hash = 5381;
  for (const ch of skills.map((s) => `${s.name}\n${s.body}`).join("\n")) {
    hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

// The bundled skills are fixed per deploy, so parse and hash them once per
// isolate instead of on every getSkills() call.
let cachedSource: SkillSource | undefined;

export function buildSamSkillSource(): SkillSource {
  if (cachedSource) return cachedSource;
  const skills = Object.entries(skillFiles)
    .map(([path, raw]) => parseSkill(path, raw))
    .filter((skill): skill is SamSkill => skill !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name));

  return (cachedSource = {
    id: "openseo-public-skills",
    fingerprint: fingerprint(skills),
    list: () =>
      Promise.resolve(
        skills.map(({ name, description }) => ({ name, description })),
      ),
    load: (name) =>
      Promise.resolve(skills.find((skill) => skill.name === name) ?? null),
  });
}
