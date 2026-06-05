import { describe, expect, it } from "vitest";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { isValidDomainHost } from "@/types/schemas/domain";

describe("isValidDomainHost", () => {
  it("accepts real registrable domains", () => {
    expect(isValidDomainHost("example.com")).toBe(true);
    expect(isValidDomainHost("sub.example.co.uk")).toBe(true);
    expect(isValidDomainHost("openseo.so")).toBe(true);
  });

  it("rejects fake TLDs, IPs, and bare hosts", () => {
    expect(isValidDomainHost("example.por")).toBe(false);
    expect(isValidDomainHost("localhost")).toBe(false);
    expect(isValidDomainHost("127.0.0.1")).toBe(false);
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

  it("rejects empty input", () => {
    expect(() => normalizeDomainInput("   ", false)).toThrowError(/required/i);
  });
});
