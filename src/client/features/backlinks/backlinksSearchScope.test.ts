import { describe, expect, it } from "vitest";
import {
  getPersistedBacklinksSearchScope,
  inferBacklinksSearchScopeFromTarget,
  resolveBacklinksSearchScope,
} from "./backlinksSearchScope";

describe("inferBacklinksSearchScopeFromTarget", () => {
  it("treats bare hostnames as domain lookups", () => {
    expect(inferBacklinksSearchScopeFromTarget("example.com")).toBe("domain");
  });

  it("treats path-based targets without a protocol as page lookups", () => {
    expect(inferBacklinksSearchScopeFromTarget("example.com/pricing")).toBe(
      "page",
    );
  });

  it("treats root urls with explicit protocol as domain lookups", () => {
    expect(inferBacklinksSearchScopeFromTarget("https://example.com/")).toBe(
      "domain",
    );
  });

  it("treats explicit urls with a path as page lookups", () => {
    expect(
      inferBacklinksSearchScopeFromTarget("https://example.com/pricing"),
    ).toBe("page");
  });

  it("uses inferred scope until the user overrides it", () => {
    expect(
      resolveBacklinksSearchScope({
        target: "example.com/pricing",
        selectedScope: "domain",
        userSelectedScope: false,
      }),
    ).toBe("page");
  });

  it("preserves a manual scope override", () => {
    expect(
      resolveBacklinksSearchScope({
        target: "https://example.com/pricing?utm_source=newsletter",
        selectedScope: "domain",
        userSelectedScope: true,
      }),
    ).toBe("domain");
  });

  it("omits persisted scope when it matches the inferred target scope", () => {
    expect(
      getPersistedBacklinksSearchScope("example.com/pricing", "page"),
    ).toBe(undefined);
  });

  it("persists explicit scope overrides", () => {
    expect(
      getPersistedBacklinksSearchScope(
        "https://example.com/pricing?utm_source=newsletter",
        "domain",
      ),
    ).toBe("domain");
  });
});
