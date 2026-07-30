import { errors as joseErrors } from "jose";
import { AppError } from "@/server/lib/errors";

// Maps a jwtVerify failure to the right AppError. Config mistakes (wrong
// POLICY_AUD, TEAM_DOMAIN pointing at the wrong team, unreachable JWKS) must
// surface as AUTH_CONFIG_MISSING with guidance — collapsing them into bare
// UNAUTHENTICATED puts self-hosters in a sign-in loop with no signal anywhere,
// since UNAUTHENTICATED is a non-reportable code. Token-level failures
// (expired, bad signature) stay UNAUTHENTICATED: re-authenticating fixes them.
export function classifyAccessVerificationError(error: unknown): AppError {
  if (error instanceof joseErrors.JWTExpired) {
    return new AppError("UNAUTHENTICATED");
  }

  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "aud") {
      return new AppError(
        "AUTH_CONFIG_MISSING",
        "Cloudflare Access token rejected: audience mismatch. POLICY_AUD does not match your Access application's AUD tag — copy it from Zero Trust -> Access controls -> Applications -> Configure -> Additional settings.",
      );
    }
    if (error.claim === "iss") {
      return new AppError(
        "AUTH_CONFIG_MISSING",
        "Cloudflare Access token rejected: issuer mismatch. TEAM_DOMAIN does not match the Cloudflare team that issued the token — check it against your team domain in Zero Trust settings.",
      );
    }
    return new AppError("UNAUTHENTICATED");
  }

  if (
    error instanceof joseErrors.JWKSNoMatchingKey ||
    error instanceof joseErrors.JWKSInvalid ||
    error instanceof joseErrors.JWKSTimeout ||
    // The caller only classifies errors thrown by jwtVerify itself, so a
    // non-jose error can only come from the remote JWKS fetch (TypeError in
    // browsers/node, plain Error like "Network connection lost" in workerd).
    !(error instanceof joseErrors.JOSEError)
  ) {
    return new AppError(
      "AUTH_CONFIG_MISSING",
      "Could not verify the Cloudflare Access token against TEAM_DOMAIN's signing keys. Check that TEAM_DOMAIN is your team's https://<team>.cloudflareaccess.com domain.",
    );
  }

  return new AppError("UNAUTHENTICATED");
}
