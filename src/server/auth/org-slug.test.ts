import { describe, expect, it } from "vitest";

import { slugify, toHex } from "@/server/auth/org-slug";

describe("slugify", () => {
  it("slugifies normal values", () => {
    expect(slugify("My Workspace")).toBe("my-workspace");
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("---weird---")).toBe("weird");
  });

  it("falls back to 'workspace' when nothing is left", () => {
    expect(slugify("")).toBe("workspace");
    expect(slugify("!!!")).toBe("workspace");
  });

  it("does not leave a trailing dash when truncation lands on a separator", () => {
    const value = `${"a".repeat(47)} extra words`;
    const slug = slugify(value);

    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(47));
  });
});

describe("toHex", () => {
  it("encodes a string as lowercase hex", () => {
    expect(toHex("abc")).toBe("616263");
  });
});
