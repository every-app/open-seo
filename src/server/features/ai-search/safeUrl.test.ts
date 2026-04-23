import { describe, expect, it } from "vitest";
import { safeHostname, safeHttpUrl } from "./safeUrl";

describe("safeHttpUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "https://example.com/path?q=1#frag",
    "https://sub.example.io",
  ])("accepts %s", (input) => {
    expect(safeHttpUrl(input)).toBe(input);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "not a url",
    "",
    "https://user:pass@evil.example.com",
    "https://user@evil.example.com",
  ])("rejects %s", (input) => {
    expect(safeHttpUrl(input)).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("safeHostname", () => {
  it("strips protocol and www prefix", () => {
    expect(safeHostname("https://www.example.com/path")).toBe("example.com");
    expect(safeHostname("http://sub.example.io")).toBe("sub.example.io");
  });

  it("returns null for unsafe schemes", () => {
    expect(safeHostname("javascript:alert(1)")).toBeNull();
    expect(safeHostname("data:text/html,foo")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(safeHostname("not a url")).toBeNull();
    expect(safeHostname(null)).toBeNull();
  });
});
