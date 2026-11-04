import { describe, expect, it } from "vitest";
import {
  readThemeCookie,
  themeCookieDomain,
  themeCookieString,
} from "./themeCookie";

describe("readThemeCookie", () => {
  it("finds the pick among other cookies", () => {
    expect(readThemeCookie("a=1; everyapp-theme=dark; b=2")).toBe("dark");
    expect(readThemeCookie("everyapp-theme=system")).toBe("system");
  });

  it("ignores a missing, unknown or look-alike cookie", () => {
    expect(readThemeCookie("")).toBeNull();
    expect(readThemeCookie("everyapp-theme=blue")).toBeNull();
    expect(readThemeCookie("my-everyapp-theme=dark")).toBeNull();
  });
});

describe("themeCookieDomain", () => {
  it("shares on the gateway host and its subdomains only", () => {
    const gateway = "https://team.example.com";
    expect(themeCookieDomain("team.example.com", gateway)).toBe(
      "team.example.com",
    );
    expect(themeCookieDomain("openseo.team.example.com", gateway)).toBe(
      "team.example.com",
    );
    expect(themeCookieDomain("evilteam.example.com", gateway)).toBeNull();
    expect(themeCookieDomain("seo.mydomain.com", gateway)).toBeNull();
    expect(themeCookieDomain("app.openseo.so", null)).toBeNull();
  });
});

describe("themeCookieString", () => {
  it("sets the domain, a year, Lax and Secure on https", () => {
    expect(themeCookieString("light", "team.example.com", true)).toBe(
      "everyapp-theme=light; Domain=team.example.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });

  it("is host-only and not Secure on http://localhost", () => {
    expect(themeCookieString("system", "localhost", false)).toBe(
      "everyapp-theme=system; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
