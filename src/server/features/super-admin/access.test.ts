import { describe, expect, it } from "vitest";
import { isSuperAdmin, parseSuperAdminEmails } from "./policy";

describe("super-admin access", () => {
  it("allows local development", () => {
    expect(
      isSuperAdmin({
        authMode: "local_noauth",
        userEmail: "admin@localhost",
        configuredEmails: undefined,
      }),
    ).toBe(true);
  });

  it("keeps the local client demo out of platform administration", () => {
    expect(
      isSuperAdmin({
        authMode: "local_noauth",
        userEmail: "client@dgtl.local",
        configuredEmails: undefined,
      }),
    ).toBe(false);
  });

  it("matches hosted administrators case-insensitively", () => {
    expect(
      isSuperAdmin({
        authMode: "hosted",
        userEmail: "Admin@DGTL.lk",
        configuredEmails: "owner@dgtl.lk, admin@dgtl.lk",
      }),
    ).toBe(true);
  });

  it("fails closed when a hosted email is not allowlisted", () => {
    expect(
      isSuperAdmin({
        authMode: "hosted",
        userEmail: "client@example.com",
        configuredEmails: "admin@dgtl.lk",
      }),
    ).toBe(false);
  });

  it("normalizes the configured allowlist", () => {
    expect([...parseSuperAdminEmails(" A@x.com, b@x.com, ")]).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });
});
