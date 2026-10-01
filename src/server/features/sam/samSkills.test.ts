import { describe, expect, it } from "vitest";
import {
  buildSamSkillSource,
  parseSkill,
} from "@/server/features/sam/samSkills";

describe("buildSamSkillSource", () => {
  // Guards the real failure modes: a skill whose frontmatter breaks (build
  // throws), an internal repo-dev skill leaking into SAM, or the public set
  // silently shrinking because a glob or marking change dropped it.
  it("serves exactly the public product skills", async () => {
    const source = buildSamSkillSource();
    const names = (await source.list()).map((skill) => skill.name);

    expect(names).toEqual([
      "competitive-landscape",
      "competitor-analysis",
      "keyword-clustering",
      "keyword-research",
      "link-prospecting",
      "local-seo",
      "seo-audit",
      "seo-coach",
      "seo-project-setup",
    ]);

    const loaded = await source.load("seo-project-setup");
    expect(loaded?.body).toContain("Surface note: you are SAM");
  });
});

describe("parseSkill line endings", () => {
  // #331: Git's `core.autocrlf=true` is the Windows default, so a fresh clone
  // hands the parser `---\r\n`. The LF-only pattern rejected every skill with
  // "Skill has no frontmatter", on files that are perfectly well formed.
  const FRONTMATTER = [
    "---",
    "name: demo",
    "description: a demo skill",
    "---",
    "",
    "Body line.",
  ];

  it("parses a skill checked out with CRLF endings", () => {
    const skill = parseSkill("/demo/SKILL.md", FRONTMATTER.join("\r\n"));

    expect(skill?.name).toBe("demo");
    expect(skill?.description).toBe("a demo skill");
    expect(skill?.body).toContain("Body line.");
  });

  it("still parses LF endings", () => {
    // The accept control: tolerating CRLF must not have been implemented by
    // loosening the pattern into one that no longer anchors the delimiters.
    const skill = parseSkill("/demo/SKILL.md", FRONTMATTER.join("\n"));

    expect(skill?.name).toBe("demo");
    expect(skill?.body).toContain("Body line.");
  });

  it("still refuses a file with no frontmatter, CRLF or not", () => {
    // The second accept control. `\r?\n` widens which endings are accepted,
    // not which files are.
    expect(() => parseSkill("/demo/SKILL.md", "Body only.\r\n")).toThrow(
      "Skill has no frontmatter",
    );
    expect(() => parseSkill("/demo/SKILL.md", "Body only.\n")).toThrow(
      "Skill has no frontmatter",
    );
  });

  it("does not mistake a horizontal rule in the body for frontmatter", () => {
    // The delimiters still have to be anchored at the start of the file and on
    // their own lines. Widening the pattern by dropping `^` and the newlines
    // would accept this and invent frontmatter out of a markdown rule.
    const body = [
      "Intro paragraph.",
      "",
      "---",
      "name: not-frontmatter",
      "---",
      "",
      "Rest.",
    ];

    for (const eol of ["\n", "\r\n"]) {
      expect(() => parseSkill("/demo/SKILL.md", body.join(eol))).toThrow(
        "Skill has no frontmatter",
      );
    }
  });
});
