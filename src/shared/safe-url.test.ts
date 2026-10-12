import { describe, expect, it } from "vitest";
import { safeHostname, safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it.each(["http://example.com", "https://example.com/path?q=1#frag"])(
    "accepts %s",
    (input) => {
      expect(safeHttpUrl(input)).toBe(input);
    },
  );

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
});

describe("safeHostname", () => {
  it("strips protocol and www prefix", () => {
    expect(safeHostname("https://www.example.com/path")).toBe("example.com");
    expect(safeHostname("http://sub.example.com")).toBe("sub.example.com");
  });
});
