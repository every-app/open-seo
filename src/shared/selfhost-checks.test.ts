import { describe, expect, it } from "vitest";
import {
  isTelemetryOptOutValue,
  looksLikeDataForSeoKey,
  validateTeamDomain,
} from "./selfhost-checks";

describe("validateTeamDomain", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(
      validateTeamDomain(" https://your-team.cloudflareaccess.com/ "),
    ).toEqual({ ok: true, origin: "https://your-team.cloudflareaccess.com" });
  });

  it("rejects a bare hostname and tells the user to add https://", () => {
    const result = validateTeamDomain("your-team.cloudflareaccess.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("https://");
      expect(result.message).toContain(
        'add the https:// prefix to "your-team.cloudflareaccess.com"',
      );
    }
  });

  it("rejects http://", () => {
    const result = validateTeamDomain("http://your-team.cloudflareaccess.com");
    expect(result.ok).toBe(false);
  });
});

describe("looksLikeDataForSeoKey", () => {
  it("accepts base64 of login:password, tolerating surrounding whitespace", () => {
    expect(looksLikeDataForSeoKey(btoa("user@example.com:secret"))).toBe(true);
    expect(looksLikeDataForSeoKey(` ${btoa("a:b")} `)).toBe(true);
  });

  it("rejects a raw dashboard API key", () => {
    expect(looksLikeDataForSeoKey("0123456789abcdef0123")).toBe(false);
  });
});

describe("isTelemetryOptOutValue", () => {
  it('treats "1" and "true" as opted out', () => {
    expect(isTelemetryOptOutValue("1")).toBe(true);
    expect(isTelemetryOptOutValue("true")).toBe(true);
  });

  it.each([undefined, null, "", "0", "false", "no", "OFF"])(
    "treats %j as opted in",
    (value) => {
      expect(isTelemetryOptOutValue(value)).toBe(false);
    },
  );
});
