import { describe, expect, it } from "vitest";
import {
  defaultScopeForPath,
  isScopeAllowedForInput,
  parseResearchTarget,
  urlMatchesResearchTarget,
} from "./researchScope";

function parseOk(
  input: string,
  scope?: Parameters<typeof parseResearchTarget>[1],
) {
  const result = parseResearchTarget(input, scope);
  if (!result.ok) throw new Error(`expected ok parse, got: ${result.message}`);
  return result.target;
}

describe("parseResearchTarget", () => {
  it("defaults a root domain to subdomains scope", () => {
    const target = parseOk("Example.com");
    expect(target).toMatchObject({
      scope: "subdomains",
      hostname: "example.com",
      path: "",
      display: "example.com",
    });
  });

  it("defaults a URL with a path to subfolder scope", () => {
    const target = parseOk("example.com/commercial-insurance/");
    expect(target).toMatchObject({
      scope: "subfolder",
      path: "/commercial-insurance",
      display: "example.com/commercial-insurance",
    });
  });

  it("strips query strings and fragments without failing", () => {
    const target = parseOk("https://example.com/blog?utm_source=x#section");
    expect(target.path).toBe("/blog");
  });

  it("preserves path casing and percent encoding", () => {
    const target = parseOk("example.com/Docs/%7Euser");
    expect(target.path).toBe("/Docs/%7Euser");
  });

  it("strips www from hostname but keeps it for page URLs", () => {
    const target = parseOk("www.example.com/blog", "exact_url");
    expect(target.hostname).toBe("example.com");
    expect(target.urlHostname).toBe("www.example.com");
  });

  it("keeps subdomain hostnames intact", () => {
    const target = parseOk("blog.example.com", "subdomains");
    expect(target.hostname).toBe("blog.example.com");
  });

  it("rejects subfolder for a root input instead of silently rescoping", () => {
    const result = parseResearchTarget("example.com", "subfolder");
    expect(result).toEqual({
      ok: false,
      message: "Add a path to use Subfolder (e.g. example.com/blog)",
    });
  });

  it("allows exact_url for a root input", () => {
    expect(parseOk("example.com", "exact_url").scope).toBe("exact_url");
  });

  it("rejects invalid hosts and credentials", () => {
    expect(parseResearchTarget("example.por").ok).toBe(false);
    expect(parseResearchTarget("").ok).toBe(false);
    expect(parseResearchTarget("my_site.com").ok).toBe(false);
    expect(parseResearchTarget("https://user:pw@example.com/x").ok).toBe(false);
  });
});

describe("scope helpers", () => {
  it("computes defaults from the path", () => {
    expect(defaultScopeForPath("")).toBe("subdomains");
    expect(defaultScopeForPath("/blog")).toBe("subfolder");
  });

  it("only disallows subfolder without a path", () => {
    expect(isScopeAllowedForInput("subfolder", "")).toBe(false);
    expect(isScopeAllowedForInput("subfolder", "/blog")).toBe(true);
    expect(isScopeAllowedForInput("exact_url", "")).toBe(true);
    expect(isScopeAllowedForInput("domain", "/blog")).toBe(true);
  });
});

describe("urlMatchesResearchTarget", () => {
  const subfolder = parseOk("example.com/blog", "subfolder");

  it("matches the subfolder itself and its children", () => {
    expect(
      urlMatchesResearchTarget("https://example.com/blog", subfolder),
    ).toBe(true);
    expect(
      urlMatchesResearchTarget("https://example.com/blog/post?x=1", subfolder),
    ).toBe(true);
    expect(
      urlMatchesResearchTarget("https://www.example.com/blog/", subfolder),
    ).toBe(true);
  });

  it("excludes similarly named sibling paths and other hosts", () => {
    expect(
      urlMatchesResearchTarget("https://example.com/blogging", subfolder),
    ).toBe(false);
    expect(
      urlMatchesResearchTarget("https://sub.example.com/blog/post", subfolder),
    ).toBe(false);
  });

  it("matches exact URLs ignoring trailing slash, query, and fragment", () => {
    const exact = parseOk("example.com/pricing", "exact_url");
    expect(
      urlMatchesResearchTarget("https://example.com/pricing/", exact),
    ).toBe(true);
    expect(
      urlMatchesResearchTarget("https://example.com/pricing?ref=x#top", exact),
    ).toBe(true);
    expect(
      urlMatchesResearchTarget("https://example.com/pricing/plans", exact),
    ).toBe(false);
  });

  it("separates domain scope from subdomains scope", () => {
    const domain = parseOk("example.com", "domain");
    const subs = parseOk("example.com", "subdomains");
    expect(urlMatchesResearchTarget("https://blog.example.com/x", domain)).toBe(
      false,
    );
    expect(urlMatchesResearchTarget("https://blog.example.com/x", subs)).toBe(
      true,
    );
    expect(urlMatchesResearchTarget("https://notexample.com/x", subs)).toBe(
      false,
    );
  });
});
