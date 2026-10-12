import { describe, expect, it } from "vitest";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { isValidDomainHost } from "@/shared/researchScope";

describe("isValidDomainHost", () => {
  it("rejects fake TLDs", () => {
    expect(isValidDomainHost("example.por")).toBe(false);
  });
});

describe("normalizeDomainInput", () => {
  it("normalizes a valid domain, stripping protocol/www/path", () => {
    expect(
      normalizeDomainInput("https://www.Example.com/path?q=1", false),
    ).toBe("example.com");
    expect(normalizeDomainInput("blog.example.com", true)).toBe(
      "blog.example.com",
    );
  });

  it("rejects a fake TLD before it can reach DataForSEO", () => {
    expect(() => normalizeDomainInput("victorgomez.por", false)).toThrowError(
      /valid domain/i,
    );
    // Validation must also run on the includeSubdomains=true path.
    expect(() => normalizeDomainInput("victorgomez.por", true)).toThrowError(
      /valid domain/i,
    );
  });
});
