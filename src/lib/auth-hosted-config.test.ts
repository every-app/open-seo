import { describe, expect, it } from "vitest";
import {
  getMissingHostedAuthConfigVariable,
  parseHostedBaseUrl,
} from "@/lib/auth-hosted-config";

const completeEnv = {
  BETTER_AUTH_URL: "https://app.openseo.so",
  BETTER_AUTH_SECRET: "a".repeat(32),
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  BYPASS_EMAIL_VERIFICATION: "true",
};

describe("hosted auth base URL", () => {
  it("accepts http on localhost and its subdomains for portless dev URLs", () => {
    expect(parseHostedBaseUrl("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    expect(parseHostedBaseUrl("http://my-branch.localhost")).toBe(
      "http://my-branch.localhost",
    );
    expect(parseHostedBaseUrl("https://app.openseo.so")).toBe(
      "https://app.openseo.so",
    );
  });

  it("rejects http on any host other than localhost and its subdomains", () => {
    expect(() => parseHostedBaseUrl("http://app.openseo.so")).toThrow(
      "BETTER_AUTH_URL must use https, localhost, or a *.localhost subdomain",
    );
  });
});

describe("missing hosted auth configuration", () => {
  it("names TURNSTILE_SECRET_KEY when the site key has no matching secret", () => {
    const missing = getMissingHostedAuthConfigVariable({
      ...completeEnv,
      TURNSTILE_SITE_KEY: "site-key",
    });

    expect(missing).toContain("TURNSTILE_SECRET_KEY");
  });

  it("names BETTER_AUTH_SECRET when it is missing or too short", () => {
    expect(
      getMissingHostedAuthConfigVariable({
        ...completeEnv,
        BETTER_AUTH_SECRET: undefined,
      }),
    ).toContain("BETTER_AUTH_SECRET");

    expect(
      getMissingHostedAuthConfigVariable({
        ...completeEnv,
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toContain("BETTER_AUTH_SECRET");
  });

  it("returns null for a complete configuration", () => {
    expect(getMissingHostedAuthConfigVariable(completeEnv)).toBeNull();
  });
});
