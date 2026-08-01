import { errors as joseErrors } from "jose";
import { describe, expect, it } from "vitest";
import { classifyAccessVerificationError } from "./accessTokenErrors";

describe("classifyAccessVerificationError", () => {
  it("maps audience mismatch to a POLICY_AUD config error", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWTClaimValidationFailed(
        'unexpected "aud" claim value',
        {},
        "aud",
        "check_failed",
      ),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
    expect(error.message).toContain("POLICY_AUD");
  });

  it("maps issuer mismatch to a TEAM_DOMAIN config error", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWTClaimValidationFailed(
        'unexpected "iss" claim value',
        {},
        "iss",
        "check_failed",
      ),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
    expect(error.message).toContain("TEAM_DOMAIN");
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

  it("maps network failures fetching the JWKS to a config error", () => {
    const error = classifyAccessVerificationError(
      new TypeError("fetch failed"),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
  });

  it("maps workerd-style plain network errors to a config error", () => {
    const error = classifyAccessVerificationError(
      new Error("Network connection lost"),
    );

    expect(error.code).toBe("AUTH_CONFIG_MISSING");
  });

  it("keeps other jose failures (bad signature) as UNAUTHENTICATED", () => {
    const error = classifyAccessVerificationError(
      new joseErrors.JWSSignatureVerificationFailed(),
    );

    expect(error.code).toBe("UNAUTHENTICATED");
  });
});
