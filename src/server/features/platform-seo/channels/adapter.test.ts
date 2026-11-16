import { describe, expect, it } from "vitest";
import {
  bodyToSend,
  hashnodeTag,
  normalizeTags,
  preparePlatformVersion,
} from "./adapter";

describe("platform adapter", () => {
  it("keeps Dev.to tags to four letters-and-digits tags", () => {
    expect(
      normalizeTags("devto", [
        "Parasite SEO",
        "café",
        "seo!",
        "web-dev",
        "ai",
        "x",
      ]),
    ).toEqual(["parasiteseo", "cafe", "seo", "webdev"]);
    // Hashnode finds tags by slug: one with no Latin letters can't be sent.
    expect(
      normalizeTags("hashnode", ["Parasite SEO", "parasite-seo", "日本語"]),
    ).toEqual(["parasite seo"]);
    expect(hashnodeTag("Parasite SEO")).toEqual({
      slug: "parasite-seo",
      name: "Parasite SEO",
    });
  });

  it("drops a leading headline, summarises the first paragraph and suggests tags", () => {
    const version = preparePlatformVersion({
      type: "devto",
      title: "What is parasite SEO",
      body: "# What is parasite SEO\n\n## Intro\n\nParasite **SEO** means [posting](https://x.com) on trusted sites.\n\nMore.",
      primaryKeyword: "parasite seo",
    });
    expect(version).toEqual({
      title: "What is parasite SEO",
      summary: "Parasite SEO means posting on trusted sites.",
      body: "## Intro\n\nParasite **SEO** means [posting](https://x.com) on trusted sites.\n\nMore.",
      tags: ["parasiteseo", "parasite", "seo"],
    });
  });

  it("guards Dev.to front matter and links back to the original", () => {
    expect(bodyToSend("---\nBody", "https://www.acme.com/post")).toBe(
      "Body\n\n---\n\n*Originally published at [acme.com](https://www.acme.com/post).*",
    );
    expect(bodyToSend("Body", null)).toBe("Body");
  });
});
