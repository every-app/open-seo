import { describe, expect, it } from "vitest";
import { parseRobotsTxt } from "@/server/lib/audit/discovery";

const ORIGIN = "https://example.com";

describe("parseRobotsTxt", () => {
  it("honors a group that names the crawler", () => {
    const robots = parseRobotsTxt(
      ORIGIN,
      ["User-agent: OpenSEO-Audit", "Disallow: /private/"].join("\n"),
    );

    expect(robots.isAllowed(`${ORIGIN}/private/report`)).toBe(false);
  });

  it("honors an allowance the crawler is named in", () => {
    const robots = parseRobotsTxt(
      ORIGIN,
      [
        "User-agent: *",
        "Disallow: /",
        "",
        "User-agent: OpenSEO-Audit",
        "Allow: /",
      ].join("\n"),
    );

    expect(robots.isAllowed(`${ORIGIN}/pricing`)).toBe(true);
  });

  it("falls back to the wildcard group when the crawler is not named", () => {
    const robots = parseRobotsTxt(
      ORIGIN,
      ["User-agent: *", "Disallow: /admin/"].join("\n"),
    );

    expect(robots.isAllowed(`${ORIGIN}/admin/settings`)).toBe(false);
    expect(robots.isAllowed(`${ORIGIN}/pricing`)).toBe(true);
  });
});
