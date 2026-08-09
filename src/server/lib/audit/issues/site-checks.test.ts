import { describe, expect, it } from "vitest";
import { detectSchemamapMissing, robotsDeclaresSchemamap } from "./site-checks";

const ORIGIN = "https://example.com";

function detect(input: { robotsText?: string | null; served?: boolean }) {
  return detectSchemamapMissing({
    origin: ORIGIN,
    robotsText: input.robotsText ?? null,
    schemamapServed: input.served ?? false,
  });
}

describe("robotsDeclaresSchemamap", () => {
  it("finds the directive regardless of case or leading space", () => {
    expect(
      robotsDeclaresSchemamap("Schemamap: https://example.com/schemamap.xml"),
    ).toBe(true);
    expect(robotsDeclaresSchemamap("  schemamap:/schemamap.xml")).toBe(true);
    expect(
      robotsDeclaresSchemamap(
        "User-agent: *\nAllow: /\n\nSCHEMAMAP: /schemamap.xml\n",
      ),
    ).toBe(true);
  });

  it("ignores missing robots.txt and unrelated directives", () => {
    expect(robotsDeclaresSchemamap(null)).toBe(false);
    expect(robotsDeclaresSchemamap("")).toBe(false);
    expect(
      robotsDeclaresSchemamap("User-agent: *\nSitemap: /sitemap.xml"),
    ).toBe(false);
  });

  it("does not match the word mid-line", () => {
    expect(
      robotsDeclaresSchemamap("# we should add a schemamap: one day"),
    ).toBe(false);
  });
});

describe("detectSchemamapMissing", () => {
  it("reports when neither the file nor the directive is present", () => {
    const issues = detect({});
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueType: "schemamap-missing",
      pageId: null,
      pageUrl: ORIGIN,
    });
  });

  it("stays quiet when /schemamap.xml is served", () => {
    expect(detect({ served: true })).toEqual([]);
  });

  it("stays quiet when robots.txt declares one", () => {
    expect(
      detect({ robotsText: "Schemamap: https://example.com/schemamap.xml" }),
    ).toEqual([]);
  });
});
