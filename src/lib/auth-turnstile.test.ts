import { describe, expect, it } from "vitest";
import {
  getHostedTurnstileSecretKey,
  hasHostedTurnstileConfig,
} from "@/lib/auth-turnstile";

describe("hosted Turnstile auth config", () => {
  it("enforces captcha from the hosted server secret alone, and only in hosted mode", () => {
    expect(
      getHostedTurnstileSecretKey({
        AUTH_MODE: "hosted",
        TURNSTILE_SECRET_KEY: " server-secret ",
      }),
    ).toBe("server-secret");
    expect(
      getHostedTurnstileSecretKey({
        AUTH_MODE: "local_noauth",
        TURNSTILE_SECRET_KEY: "server-secret",
      }),
    ).toBeUndefined();
  });

  it("fails hosted config on a site key without a secret, not on a secret without a site key", () => {
    expect(
      hasHostedTurnstileConfig({
        AUTH_MODE: "hosted",
        TURNSTILE_SITE_KEY: "site-key",
      }),
    ).toBe(false);
    // Build/runtime divergence: the secret alone still enforces captcha.
    expect(
      hasHostedTurnstileConfig({
        AUTH_MODE: "hosted",
        TURNSTILE_SECRET_KEY: "server-secret",
      }),
    ).toBe(true);
  });
});
