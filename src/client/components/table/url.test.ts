import { describe, expect, it } from "vitest";
import { formatUrlForDisplay, resolveUrlHref } from "./url";

describe("table URL helpers", () => {
  it("strips scroll-to-text fragments but keeps normal hashes and queries", () => {
    expect(
      formatUrlForDisplay("https://example.com/a%20b?q=one#:~:text=needle"),
    ).toBe("https://example.com/a b?q=one");
    expect(formatUrlForDisplay("https://example.com/path?q=1#section")).toBe(
      "https://example.com/path?q=1#section",
    );
  });

  it("rejects unsafe absolute URL schemes", () => {
    expect(resolveUrlHref("javascript:alert(1)", "example.com")).toBeNull();
  });
});
