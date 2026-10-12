import { errors as joseErrors } from "jose";
import { describe, expect, it } from "vitest";
import { classifyAccessVerificationError } from "./accessTokenErrors";

describe("classifyAccessVerificationError", () => {
  it.each([
    ["aud", "POLICY_AUD"],
    ["iss", "TEAM_DOMAIN"],
  ])("maps an %s claim mismatch to a %s config error", (claim, variable) => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWTClaimValidationFailed(
        `unexpected "${claim}" claim value`,
        {},
        claim,
        "check_failed",
      ),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
    expect(error.message).toContain(variable);
  });

  it("keeps expired tokens as UNAUTHENTICATED (re-auth fixes them)", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWTExpired('"exp" claim timestamp check failed', {}),
    );

    expect(error.code).toBe("UNAUTHENTICATED");
  });

  it("maps JWKS lookup failures to a TEAM_DOMAIN config error", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWKSNoMatchingKey(),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
    expect(error.message).toContain("TEAM_DOMAIN");
  });

  it.each([
    new TypeError("fetch failed"),
    new Error("Network connection lost"),
  ])(
    "maps non-jose network failures fetching the JWKS to a config error: %s",
    (cause) => {
      expect(classifyAccessVerificationError(cause).code).toBe(
        "AUTH_CONFIG_MISSING",
      );
    },
  );

  it("keeps other jose failures (bad signature) as UNAUTHENTICATED", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWSSignatureVerificationFailed(),
    );

    expect(error.code).toBe("UNAUTHENTICATED");
  });
});
