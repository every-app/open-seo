import { describe, expect, it } from "vitest";
import {
  isTelemetryOptOutValue,
  looksLikeDataForSeoKey,
  validateTeamDomain,
} from "./selfhost-checks";

describe("validateTeamDomain", () => {
  it("accepts a full https team domain", () => {
    expect(
      validateTeamDomain("https://your-team.cloudflareaccess.com"),
    ).toEqual({ ok: true, origin: "https://your-team.cloudflareaccess.com" });
  });

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

  it("rejects empty values", () => {
    expect(validateTeamDomain("").ok).toBe(false);
  });
});

describe("looksLikeDataForSeoKey", () => {
  it("accepts base64 of login:password", () => {
    expect(looksLikeDataForSeoKey(btoa("user@example.com:secret"))).toBe(true);
  });

  it("rejects a raw dashboard API key", () => {
    expect(looksLikeDataForSeoKey("0123456789abcdef0123")).toBe(false);
  });

  it("rejects base64 without a colon", () => {
    expect(looksLikeDataForSeoKey(btoa("no-colon-here"))).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(looksLikeDataForSeoKey(` ${btoa("a:b")} `)).toBe(true);
  });
});

describe("isTelemetryOptOutValue", () => {
  it("treats unset and empty as opted in", () => {
    expect(isTelemetryOptOutValue(undefined)).toBe(false);
    expect(isTelemetryOptOutValue(null)).toBe(false);
    expect(isTelemetryOptOutValue("")).toBe(false);
  });

  it('treats "1" and "true" as opted out', () => {
    expect(isTelemetryOptOutValue("1")).toBe(true);
    expect(isTelemetryOptOutValue("true")).toBe(true);
  });

  it('treats explicit "0"/"false"/"no"/"off" as opted in', () => {
    expect(isTelemetryOptOutValue("0")).toBe(false);
    expect(isTelemetryOptOutValue("false")).toBe(false);
    expect(isTelemetryOptOutValue("no")).toBe(false);
    expect(isTelemetryOptOutValue("OFF")).toBe(false);
  });
});
