import type { JWTPayload } from "jose";

/**
 * Which Cloudflare Access JWT becomes which user.
 *
 * Access issues two shapes of token and only one of them describes a person. A user token
 * carries `sub` and `email`. A **service token** — admitted by a Service Auth policy, which is
 * the only way anything headless gets through Access — carries neither: it identifies a machine
 * by `common_name`, the token's Client ID.
 *
 * Requiring an email therefore rejected every non-interactive caller. Access would authenticate
 * the request and mint a valid JWT, and the app would throw UNAUTHENTICATED at a token it had
 * just cryptographically verified. That blocks cron, CI, and any MCP client that can only send
 * static headers.
 *
 * A service token gets a stable synthetic identity instead, mirroring what `local_noauth`
 * already does with `local-admin`: an externally-trusted principal that is not a person still
 * needs a row in `user`, because every workspace table is keyed on one. The address uses the
 * reserved `.invalid` TLD (RFC 2606) so it can never be mistaken for something deliverable.
 *
 * Authorization is unchanged and stays where it belongs — a service token only reaches this
 * function if an operator wrote a policy admitting it.
 *
 * Kept free of `cloudflare:workers` imports so it is unit-testable outside the Workers runtime.
 */
export type AccessIdentity = { userId: string; userEmail: string };

/** Namespaced so a service id can never collide with a user's `sub`. */
export const SERVICE_TOKEN_ID_PREFIX = "cf-service-token:";
/** RFC 2606 reserves `.invalid`; nothing here is a routable address. */
export const SERVICE_TOKEN_EMAIL_DOMAIN = "service.invalid";

export function resolveAccessIdentity(
  payload: JWTPayload,
): AccessIdentity | null {
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const userEmail = typeof payload.email === "string" ? payload.email : null;

  if (userId && userEmail) {
    return { userId, userEmail };
  }

  const commonName =
    typeof payload.common_name === "string" ? payload.common_name.trim() : "";

  if (commonName) {
    // `sub` is absent or empty on a service-token assertion, so the Client ID is the only
    // stable handle the token offers.
    return {
      userId: `${SERVICE_TOKEN_ID_PREFIX}${commonName}`,
      userEmail: `${commonName}@${SERVICE_TOKEN_EMAIL_DOMAIN}`,
    };
  }

  return null;
}
