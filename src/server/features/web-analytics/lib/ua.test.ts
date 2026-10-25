import { describe, expect, it } from "vitest";
import { isBot, parseUA } from "./ua";

describe("user agents", () => {
  it("parses common browsers", () => {
    expect(
      parseUA(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Mobile Safari", os: "iOS", device: "Mobile" });
    expect(
      parseUA(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
      ),
    ).toEqual({ browser: "Edge", os: "Windows", device: "Desktop" });
    expect(
      parseUA(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      ).browser,
    ).toBe("Chrome");
  });

  it("flags bots", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(
      isBot(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36",
      ),
    ).toBe(false);
  });
});
